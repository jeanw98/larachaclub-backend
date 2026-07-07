const pool = require('../db/pool');

const ACTIVITY_TYPES = ['coito', 'entreno'];

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

function getCoitoTier(streak) {
  if (streak <= 3) return 'Virgen';
  if (streak <= 10) return 'Gallo follador';
  return 'Gigolo';
}

function getEntrenoTier(streak) {
  if (streak <= 3) return 'Debilucho';
  if (streak <= 10) return 'Medio fuerte';
  return 'Goku';
}

function getTier(activityType, streak) {
  return activityType === 'coito' ? getCoitoTier(streak) : getEntrenoTier(streak);
}

function effectiveStreak(row, today) {
  if (!row?.last_log_date) return 0;
  const last = formatDate(new Date(row.last_log_date));
  const yesterday = addDays(today, -1);
  if (last === today || last === yesterday) return row.current_streak;
  return 0;
}

function formatActivity(row, today) {
  const last = row.last_log_date ? formatDate(new Date(row.last_log_date)) : null;
  const streak = effectiveStreak(row, today);
  return {
    activity_type: row.activity_type,
    checked_today: last === today,
    current_streak: streak,
    longest_streak: row.longest_streak,
    total_days: row.total_count,
    tier: getTier(row.activity_type, streak),
    last_log_date: last,
  };
}

async function ensureUserStreaks(userId, client = pool) {
  for (const type of ACTIVITY_TYPES) {
    await client.query(
      `INSERT INTO user_streaks (user_id, activity_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, type]
    );
  }
}

async function getUserStreaks(userId, today = formatDate(new Date())) {
  await ensureUserStreaks(userId);
  const { rows } = await pool.query(
    `SELECT activity_type, current_streak, longest_streak, last_log_date, total_count
     FROM user_streaks WHERE user_id = $1`,
    [userId]
  );
  const byType = Object.fromEntries(rows.map((r) => [r.activity_type, r]));
  return {
    coito: formatActivity(byType.coito || { activity_type: 'coito', current_streak: 0, longest_streak: 0, total_count: 0 }, today),
    entreno: formatActivity(byType.entreno || { activity_type: 'entreno', current_streak: 0, longest_streak: 0, total_count: 0 }, today),
  };
}

async function logActivity(userId, activityType, logDate) {
  if (!ACTIVITY_TYPES.includes(activityType)) {
    const err = new Error('Tipo de actividad inválido');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureUserStreaks(userId, client);

    const insertLog = await client.query(
      `INSERT INTO user_daily_logs (user_id, activity_type, log_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, activity_type, log_date) DO NOTHING
       RETURNING id`,
      [userId, activityType, logDate]
    );

    if (!insertLog.rows.length) {
      await client.query('COMMIT');
      return getUserStreaks(userId, logDate);
    }

    const { rows } = await client.query(
      `SELECT current_streak, longest_streak, last_log_date, total_count
       FROM user_streaks WHERE user_id = $1 AND activity_type = $2 FOR UPDATE`,
      [userId, activityType]
    );

    const row = rows[0];
    const last = row.last_log_date ? formatDate(new Date(row.last_log_date)) : null;
    const yesterday = addDays(logDate, -1);

    let currentStreak = 1;
    if (last === yesterday) {
      currentStreak = row.current_streak + 1;
    }

    const longestStreak = Math.max(row.longest_streak, currentStreak);

    await client.query(
      `UPDATE user_streaks
       SET current_streak = $1, longest_streak = $2, last_log_date = $3,
           total_count = total_count + 1, updated_at = NOW()
       WHERE user_id = $4 AND activity_type = $5`,
      [currentStreak, longestStreak, logDate, userId, activityType]
    );

    await client.query('COMMIT');
    return getUserStreaks(userId, logDate);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getStreakLeaderboard(activityType, today = formatDate(new Date())) {
  if (!ACTIVITY_TYPES.includes(activityType)) {
    const err = new Error('Tipo de actividad inválido');
    err.status = 400;
    throw err;
  }

  const yesterday = addDays(today, -1);
  const { rows } = await pool.query(
    `SELECT u.id, u.nickname, u.avatar_color,
            s.current_streak, s.longest_streak, s.total_count, s.last_log_date
     FROM user_streaks s
     JOIN users u ON u.id = s.user_id
     WHERE s.activity_type = $1 AND s.total_count > 0
     ORDER BY
       CASE
         WHEN s.last_log_date >= $2::date THEN s.current_streak
         ELSE 0
       END DESC,
       s.longest_streak DESC,
       s.total_count DESC,
       u.nickname ASC
     LIMIT 50`,
    [activityType, yesterday]
  );

  return rows.map((row, i) => {
    const streak = effectiveStreak(row, today);
    return {
      id: row.id,
      nickname: row.nickname,
      avatar_color: row.avatar_color,
      current_streak: streak,
      longest_streak: row.longest_streak,
      total_days: row.total_count,
      tier: getTier(activityType, streak),
      rank_position: i + 1,
      on_streak: streak > 0,
    };
  });
}

module.exports = {
  ACTIVITY_TYPES,
  formatDate,
  getCoitoTier,
  getEntrenoTier,
  getUserStreaks,
  logActivity,
  getStreakLeaderboard,
};

const ADJECTIVES = [
  'Cosmic', 'Midnight', 'Neon', 'Wild', 'Sneaky', 'Golden', 'Pixel', 'Turbo',
  'Chill', 'Funky', 'Mystic', 'Rogue', 'Lucky', 'Spicy', 'Velvet', 'Thunder',
  'Glitch', 'Shadow', 'Blazing', 'Wicked', 'Stellar', 'Crimson', 'Electric',
];

const NOUNS = [
  'Panda', 'Wizard', 'Ninja', 'Phoenix', 'Otter', 'Voyager', 'Comet', 'Goblin',
  'Pirate', 'Llama', 'Falcon', 'Ghost', 'Kraken', 'Rocket', 'Yeti', 'Jester',
  'Dragon', 'Moose', 'Viper', 'Nomad', 'Gnome', 'Badger', 'Cobra', 'Ranger',
];

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA', '#F472B6', '#34D399',
  '#60A5FA', '#FB923C', '#E879F9', '#2DD4BF', '#F87171', '#818CF8',
];

function generateCoolName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj}${noun}${num}`;
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

const REACTION_POINTS = {
  funny: 3,
  love: 2,
  wow: 2,
  scare: 1,
  meh: 0,
  awful: -1,
};

module.exports = { generateCoolName, randomColor, REACTION_POINTS };

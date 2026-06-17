export const TYPE_COLORS: Record<string, string> = {
  fire: '#FF6035',
  water: '#448AFF',
  grass: '#43A047',
  electric: '#FDD835',
  psychic: '#E91E63',
  ice: '#00BCD4',
  dragon: '#5C35CC',
  dark: '#37474F',
  fairy: '#F06292',
  normal: '#9E9E9E',
  fighting: '#D32F2F',
  flying: '#29B6F6',
  poison: '#AB47BC',
  ground: '#A1887F',
  rock: '#78909C',
  bug: '#7CB342',
  ghost: '#3F51B5',
  steel: '#607D8B',
}

export const TYPE_BG_COLORS: Record<string, string> = {
  fire: '#1a0a05',
  water: '#050d1a',
  grass: '#071a05',
  electric: '#1a1600',
  psychic: '#1a0510',
  ice: '#001a1a',
  dragon: '#0a0520',
  dark: '#050708',
  fairy: '#1a0510',
  normal: '#111111',
  fighting: '#1a0303',
  flying: '#051520',
  poison: '#12041a',
  ground: '#150e0a',
  rock: '#0d1014',
  bug: '#0a1304',
  ghost: '#050820',
  steel: '#0a0e10',
}

export const STAT_DISPLAY: Record<string, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'Sp.ATK',
  'special-defense': 'Sp.DEF',
  speed: 'SPD',
}

export const MAX_STAT: Record<string, number> = {
  hp: 255,
  attack: 190,
  defense: 230,
  'special-attack': 194,
  'special-defense': 230,
  speed: 180,
}

export interface PokemonListItem {
  id: number
  name: string
  displayName: string
  sprite: string
  thumb: string
  types: string[]
}

export interface PokemonStat {
  name: string
  value: number
  percent: number
}

export interface PokemonDetail extends PokemonListItem {
  height: number
  weight: number
  stats: PokemonStat[]
  abilities: string[]
}

export function capitalize(str: string): string {
  return str
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function formatId(id: number): string {
  return '#' + String(id).padStart(3, '0')
}

export function spriteUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
}

// Small (96px, ~5-30KB) sprite for list thumbnails. The 475px official-artwork is far too heavy to
// load 60+ of at once — it dominates memory (decoded bitmaps), network, and decode time.
export function thumbUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
}

export function primaryTypeColor(types: string[]): string {
  return TYPE_COLORS[types[0]] ?? '#9E9E9E'
}

export function primaryTypeBg(types: string[]): string {
  return TYPE_BG_COLORS[types[0]] ?? '#111111'
}

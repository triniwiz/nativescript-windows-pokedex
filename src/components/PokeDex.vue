<script lang="ts" setup>
import { ref, computed, onMounted, markRaw, watch } from 'nativescript-vue'
import { ImageSource, ObservableArray } from '@nativescript/core'
import PokemonDetail from './PokemonDetail.vue'
import {
  type PokemonListItem,
  type PokemonDetail as IPokemonDetail,
  type PokemonStat,
  capitalize,
  formatId,
  spriteUrl,
  thumbUrl,
  primaryTypeColor,
  TYPE_COLORS,
  MAX_STAT,
} from '../utils/pokemon'

// LRU cache of decoded thumbnails keyed by Pokémon id. The ListView recycles rows on scroll, so
// without a cache each reused row re-downloads + re-decodes its sprite (a blank flash on fast scroll).
// Once a sprite has loaded we hand the recycled row the already-decoded ImageSource (instant, no
// network), so revisited rows don't go blank. markRaw keeps Vue from making the native source
// reactive. Capped so scrolling the full 1302-entry dex doesn't accumulate every decoded bitmap —
// evicting a non-visible entry just means it re-loads if revisited (visible Images hold their own ref).
const THUMB_CACHE_MAX = 150
const thumbCache = new Map<number, ImageSource>()
const thumbPending = new Set<number>()

function thumbSrc(item: PokemonListItem): string | ImageSource {
  const cached = thumbCache.get(item.id)
  if (cached) {
    // Touch for LRU: move to most-recently-used (re-insert at the end).
    thumbCache.delete(item.id)
    thumbCache.set(item.id, cached)
    return cached
  }
  // First sighting: kick off a one-time load+cache and let the row show the URL for now. When the
  // row is recycled back into view it gets the cached decoded source instead of a fresh download.
  if (!thumbPending.has(item.id)) {
    thumbPending.add(item.id)
    ImageSource.fromUrl(item.thumb)
      .then((src) => {
        if (!src) return
        thumbCache.set(item.id, markRaw(src))
        while (thumbCache.size > THUMB_CACHE_MAX) {
          thumbCache.delete(thumbCache.keys().next().value as number) // evict least-recently-used
        }
      })
      .catch(() => { /* fall back to the URL on next render */ })
      .then(() => thumbPending.delete(item.id))
  }
  return item.thumb
}

const pokemonList = ref<PokemonListItem[]>([])
// The list is backed by an ObservableArray so growth is granular: an infinite-scroll page is pushed
// in and the native Windows ListView inserts just those rows (scroll position + already-realized cells
// preserved) — no full refresh. `pokemonList` stays the plain master copy used for filtering + the
// count labels; `visible` is what the ListView binds to. markRaw keeps Vue from wrapping it in a
// reactive Proxy (which would break `instanceof ObservableArray` and its change-event plumbing).
const visible = markRaw(new ObservableArray<PokemonListItem>())
const selected = ref<IPokemonDetail | null>(null)
const loadingList = ref(true)      // first page still loading → show skeleton
const loadingMore = ref(false)     // a subsequent page is loading → show bottom bar
const loadingDetail = ref(false)
const loadError = ref(false)       // first page failed to load → show retry state
const search = ref('')
const activeType = ref<string | null>(null)
const totalCount = ref(0)          // total available in the National Dex (from aggregate)
const cache = new Map<number, IPokemonDetail>()

// Paginated infinite scroll: fetch the dex a page at a time so launch never blocks on a huge
// first render and memory stays bounded (only loaded pages + virtualized rows are in memory).
const PAGE_SIZE = 400
let nextOffset = 0

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]

const ALL_TYPES = [
  'fire','water','grass','electric','psychic','ice',
  'dragon','dark','fairy','normal','fighting','flying',
  'poison','ground','rock','bug','ghost','steel',
]

const filtering = computed(() => !!search.value.trim() || !!activeType.value)

const filtered = computed(() => {
  let list = pokemonList.value
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter(p => p.name.includes(q) || String(p.id).includes(q))
  if (activeType.value) list = list.filter(p => p.types.includes(activeType.value!))
  return list
})

const allLoaded = computed(() => totalCount.value > 0 && pokemonList.value.length >= totalCount.value)

const countLabel = computed(() => {
  const loaded = pokemonList.value.length
  if (loaded === 0) return 'Loading…'
  if (filtering.value) return `${filtered.value.length} / ${loaded}`
  return totalCount.value ? `${loaded} / ${totalCount.value}` : `${loaded}`
})

const GRAPHQL_URL = 'https://beta.pokeapi.co/graphql/v1beta'

function buildQuery(limit: number, offset: number): string {
  // Only ask for the (expensive) total count on the very first page.
  const aggregate = offset === 0 ? 'pokemon_v2_pokemon_aggregate { aggregate { count } }' : ''
  return `{
    ${aggregate}
    pokemon_v2_pokemon(limit: ${limit}, offset: ${offset}, order_by: {id: asc}) {
      id name
      pokemon_v2_pokemontypes { pokemon_v2_type { name } }
    }
  }`
}

async function loadMore() {
  if (loadingMore.value || allLoaded.value) return
  loadingMore.value = true
  loadError.value = false
  // Nothing on screen yet (first load or a retry after failure) → show the skeleton, not a blank pane.
  if (pokemonList.value.length === 0) loadingList.value = true
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: buildQuery(PAGE_SIZE, nextOffset) }),
    })
    const json = await res.json()
    if (nextOffset === 0) {
      totalCount.value = json.data?.pokemon_v2_pokemon_aggregate?.aggregate?.count ?? 0
    }
    const raw = (json.data?.pokemon_v2_pokemon ?? []) as any[]
    const mapped = raw.map((p: any) => ({
      id: p.id,
      name: p.name,
      displayName: capitalize(p.name),
      sprite: spriteUrl(p.id),
      thumb: thumbUrl(p.id),
      types: p.pokemon_v2_pokemontypes.map((t: any) => t.pokemon_v2_type.name),
    }))
    pokemonList.value = pokemonList.value.concat(mapped)
    // Append the new page into the bound ObservableArray → core's _onItemsChanged inserts just these
    // rows in place (granular Add, scroll preserved). Paging is paused while filtering, so when this
    // runs `visible` mirrors the full list; the filter watch reconciles `visible` on filter changes.
    if (!filtering.value) visible.push(...mapped)
    nextOffset += raw.length
    // Defensive end-detection in case the aggregate count is unavailable.
    if (raw.length < PAGE_SIZE && totalCount.value === 0) totalCount.value = pokemonList.value.length
  } catch (e) {
    console.error('loadMore failed', e)
    // Only surface a blocking error state when there's nothing to show yet; a failed later page
    // just pauses paging (the user keeps what's already loaded).
    if (pokemonList.value.length === 0) loadError.value = true
  } finally {
    loadingMore.value = false
    loadingList.value = false
  }
}

// Fired by the ListView as the user nears the bottom. Pause auto-paging while the user is
// searching/filtering (the filter only narrows the already-loaded set; clearing it resumes paging).
function onLoadMore() {
  if (filtering.value) return
  loadMore()
}

async function selectPokemon(item: PokemonListItem) {
  if (selected.value?.id === item.id) return
  if (cache.has(item.id)) {
    selected.value = cache.get(item.id)!
    return
  }
  loadingDetail.value = true
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${item.id}`)
    const data = await res.json()
    const detail: IPokemonDetail = {
      id: item.id,
      name: item.name,
      displayName: item.displayName,
      sprite: item.sprite,
      thumb: item.thumb,
      types: item.types,
      height: data.height / 10,
      weight: data.weight / 10,
      stats: data.stats.map((s: any): PokemonStat => ({
        name: s.stat.name,
        value: s.base_stat,
        percent: Math.round((s.base_stat / (MAX_STAT[s.stat.name] ?? 255)) * 100),
      })),
      abilities: data.abilities
        .filter((a: any) => !a.is_hidden)
        .map((a: any) => capitalize(a.ability.name)),
    }
    cache.set(item.id, detail)
    selected.value = detail
  } catch (e) {
    console.error('selectPokemon failed', e)
  } finally {
    loadingDetail.value = false
  }
}

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#9E9E9E'
}

function toggleType(type: string) {
  activeType.value = activeType.value === type ? null : type
}

function clearFilters() {
  search.value = ''
  activeType.value = null
}

// Reconcile the bound list when the FILTER changes (data growth is handled by the push in loadMore).
// A filter change is wholesale, so splice-replace in one call; core coalesces that into a single
// ItemsSource reset (WinRT has no partial-range vector event — bulk == one reset, never N events).
watch([search, activeType], () => {
  visible.splice(0, visible.length, ...filtered.value)
})

onMounted(loadMore)
</script>

<template>
  <Page actionBarHidden="true" backgroundColor="#080810">
    <GridLayout columns="370, 1, *" rows="*">

      <!-- ── SIDEBAR ── -->
      <GridLayout col="0" rows="auto, auto, auto, auto, *" padding="0 16" backgroundColor="#0b0b1a">

        <!-- Header -->
        <StackLayout row="0" class="sidebar-header">
          <Label text="POKÉDEX" class="app-title" />
          <GridLayout columns="*, auto">
            <Label col="0" text="National Dex" class="app-subtitle" />
            <Label col="1" :text="countLabel" class="app-count" />
          </GridLayout>
        </StackLayout>

        <!-- Search -->
        <GridLayout row="1" columns="auto, *" class="search-wrap">
          <Label col="0" text="⌕" class="search-icon" />
          <TextField
            col="1"
            v-model="search"
            hint="Search by name or number..."
            class="search-field"
            returnKeyType="search"
          />
        </GridLayout>

        <!-- Type filter -->
        <ScrollView row="2" orientation="horizontal" scrollBarIndicatorVisible="false" class="type-scroll">
          <FlexboxLayout flexDirection="row" flexWrap="nowrap" class="type-chips">
            <Label
              v-for="type in ALL_TYPES"
              :key="type"
              :text="type.toUpperCase()"
              class="type-chip"
              :borderColor="typeColor(type)"
              :color="activeType === type ? '#080810' : typeColor(type)"
              :backgroundColor="activeType === type ? typeColor(type) : '#0b0b1a'"
              @tap="toggleType(type)"
            />
          </FlexboxLayout>
        </ScrollView>

        <!-- Divider -->
        <ContentView row="3" backgroundColor="#151530" height="1" />

        <!-- List -->
        <GridLayout row="4" rows="*">

            <!-- Skeleton placeholders (shown instantly while the first page loads) -->
            <StackLayout v-if="loadingList" class="skeleton-wrap">
              <GridLayout
                v-for="n in SKELETON_ROWS"
                :key="n"
                columns="58, *"
                class="poke-card skeleton-card"
              >
                <ContentView col="0" class="sk-avatar" />
                <StackLayout col="1" class="poke-info">
                  <ContentView class="sk-line sk-id" />
                  <ContentView class="sk-line sk-name" />
                  <ContentView class="sk-line sk-badge" />
                </StackLayout>
              </GridLayout>
            </StackLayout>

            <!-- First-load failure -->
            <StackLayout
              v-else-if="loadError && pokemonList.length === 0"
              verticalAlignment="center"
              horizontalAlignment="center"
              class="list-msg"
            >
              <Label text="⚠" class="list-msg-icon" />
              <Label text="Couldn't load the Pokédex" class="list-msg-title" />
              <Label text="Check your connection and try again." class="list-msg-sub" />
              <Label text="RETRY" class="list-msg-action" @tap="loadMore" />
            </StackLayout>

            <!-- No matches for the current search / type filter -->
            <StackLayout
              v-else-if="filtered.length === 0"
              verticalAlignment="center"
              horizontalAlignment="center"
              class="list-msg"
            >
              <Label text="◌" class="list-msg-icon" />
              <Label text="No Pokémon found" class="list-msg-title" />
              <Label text="No loaded Pokémon match your search or filter." class="list-msg-sub" />
              <Label text="CLEAR FILTERS" class="list-msg-action" @tap="clearFilters" />
            </StackLayout>

            <!-- Actual list -->
            <ListView
              v-else
              :items="visible"
              separatorColor="transparent"
              class="poke-list"
              @loadMoreItems="onLoadMore"
            >
              <template #default="{ item }">
                <GridLayout
                  columns="58, *"
                  class="poke-card"
                  :backgroundColor="selected && selected.id === item.id ? '#1a1a38' : '#0b0b1a'"
                  :borderLeftColor="selected && selected.id === item.id ? primaryTypeColor(item.types) : 'transparent'"
                  @tap="selectPokemon(item)"
                >
                  <Image
                    col="0"
                    :src="thumbSrc(item)"
                    stretch="aspectFit"
                    class="poke-sprite"
                  />
                  <StackLayout col="1" class="poke-info">
                    <Label :text="formatId(item.id)" class="poke-id" />
                    <Label :text="item.displayName" class="poke-name" />
                    <FlexboxLayout flexDirection="row" class="poke-types">
                      <!-- Key by index, NOT the type name: a recycled row's types change every rebind,
                           and keying by the volatile name made Vue destroy+recreate the badge elements
                           each time (expensive NS element creation on Windows). By index the two badge
                           Labels are reused — only their text/color update in place. -->
                      <Label
                        v-for="(t, i) in item.types"
                        :key="i"
                        :text="t.toUpperCase()"
                        :backgroundColor="typeColor(t)"
                        class="poke-type-badge"
                      />
                    </FlexboxLayout>
                  </StackLayout>
                </GridLayout>
              </template>
            </ListView>

            <!-- Loading-more bar (pinned to the bottom while the next page streams in) -->
            <FlexboxLayout
              v-if="loadingMore && !loadingList"
              verticalAlignment="bottom"
              justifyContent="center"
              alignItems="center"
              class="load-more-bar"
            >
              <ActivityIndicator busy="true" color="#cc0000" width="16" height="16" />
              <Label text="Loading more…" class="load-more-text" />
            </FlexboxLayout>

        </GridLayout>
      </GridLayout>

      <!-- ── DIVIDER ── -->
      <ContentView col="1" backgroundColor="#151530" />

      <!-- ── DETAIL PANEL ── -->
      <ContentView col="2">
        <!-- Loading detail -->
        <GridLayout v-if="loadingDetail" rows="*, auto, *" backgroundColor="#080810">
          <StackLayout row="1" horizontalAlignment="center">
            <ActivityIndicator busy="true" color="#cc0000" />
            <Label text="Loading..." class="loading-text" />
          </StackLayout>
        </GridLayout>

        <!-- Pokemon detail -->
        <PokemonDetail
          v-else-if="selected"
          :pokemon="selected"
          :loading="loadingDetail"
        />

        <!-- Empty state -->
        <GridLayout v-else rows="*, auto, *" backgroundColor="#080810">
          <StackLayout row="1" horizontalAlignment="center" verticalAlignment="center" class="empty-state">
            <Label text="◌" class="empty-icon" />
            <Label text="Select a Pokémon" class="empty-title" />
            <Label text="Choose one from the sidebar to view its details, stats, and abilities" class="empty-sub" />
          </StackLayout>
        </GridLayout>
      </ContentView>

    </GridLayout>
  </Page>
</template>

<style>
/* ── Sidebar ── */
.sidebar-header {
  padding: 20 20 14 20;
  border-bottom-width: 1;
  border-bottom-color: #151530;
}
.app-title {
  font-size: 20;
  font-weight: 900;
  color: #cc1111;
  letter-spacing: 5;
}
.app-subtitle {
  font-size: 11;
  color: #3a3a5a;
  margin-top: 2;
  letter-spacing: 0.5;
  vertical-align: middle;
}
.app-count {
  font-size: 11;
  color: #3a3a5a;
  margin-top: 2;
  text-align: right;
  vertical-align: middle;
}

/* Search */
.search-wrap {
  margin: 10 14 8 14;
  padding: 0 12;
  background-color: #12122a;
  border-radius: 10;
  border-width: 1;
  border-color: #1e1e3a;
}
.search-icon {
  font-size: 18;
  color: #3a3a5a;
  vertical-align: middle;
}
.search-field {
  font-size: 13;
  color: #c0c0d8;
  placeholder-color: #2a2a4a;
  background-color: transparent;
  border-width: 0;
  padding: 9 0;
}

/* Type chips */
.type-scroll {
  height: 36;
  margin: 0 0 0 0;
}
.type-chips {
  padding: 4 10;
}
.type-chip {
  font-size: 8;
  font-weight: 800;
  letter-spacing: 0.5;
  padding: 3 6;
  margin-right: 5;
  border-radius: 8;
  border-width: 1;
}

/* Pokemon list */
.poke-list {
  background-color: transparent;
}
.poke-card {
  margin: 2 10;
  padding: 8 10;
  border-radius: 10;
  border-left-width: 3;
  border-left-color: transparent;
}
.poke-sprite {
  width: 48;
  height: 48;
  border-radius: 24;
  background-color: #12122a;
}
.poke-info {
  padding-left: 8;
  vertical-align: middle;
}
.poke-id {
  font-size: 10;
  color: #3a3a5a;
  font-weight: 700;
}
.poke-name {
  font-size: 14;
  color: #dde0f5;
  font-weight: 700;
  margin-top: 1;
}
.poke-types {
  margin-top: 4;
}
.poke-types-text {
  font-size: 9;
  font-weight: 800;
  letter-spacing: 1;
  margin-top: 4;
}
.poke-type-badge {
  font-size: 7;
  font-weight: 900;
  letter-spacing: 0.5;
  color: white;
  padding: 2 7;
  border-radius: 6;
  margin-right: 4;
}

/* Skeleton placeholders */
.skeleton-wrap {
  padding-top: 4;
}
.skeleton-card {
  opacity: 0.5;
}
.sk-avatar {
  width: 48;
  height: 48;
  border-radius: 24;
  background-color: #15152e;
}
.sk-line {
  background-color: #15152e;
  border-radius: 4;
  margin-bottom: 5;
}
.sk-id {
  width: 40;
  height: 8;
}
.sk-name {
  width: 120;
  height: 12;
}
.sk-badge {
  width: 64;
  height: 10;
}

/* Loader */
.loader {
  margin-top: 60;
  horizontal-align: center;
  vertical-align: center;
}

/* Loading-more (pagination) indicator at the list bottom */
.load-more-bar {
  padding: 8 0 12 0;
  background-color: #0b0b1a;
}
.load-more-text {
  font-size: 11;
  color: #5a5a7a;
  margin-left: 8;
  vertical-align: middle;
}

/* In-list message (load error / no results) */
.list-msg {
  padding: 0 28;
}
.list-msg-icon {
  font-size: 44;
  color: #2a2a4a;
  text-align: center;
  margin-bottom: 14;
}
.list-msg-title {
  font-size: 15;
  font-weight: 700;
  color: #6a6a8a;
  text-align: center;
}
.list-msg-sub {
  font-size: 12;
  color: #3a3a5a;
  text-align: center;
  margin-top: 6;
  line-height: 1.5;
}
.list-msg-action {
  font-size: 11;
  font-weight: 800;
  letter-spacing: 1;
  color: #cc1111;
  text-align: center;
  margin-top: 16;
  padding: 8 18;
  border-width: 1;
  border-color: #cc111155;
  border-radius: 8;
}

/* Detail panel states */
.loading-text {
  font-size: 13;
  color: #3a3a5a;
  text-align: center;
  margin-top: 12;
}
.empty-state {
  padding: 0 40;
}
.empty-icon {
  font-size: 72;
  color: #1a1a2e;
  text-align: center;
  margin-bottom: 20;
}
.empty-title {
  font-size: 20;
  font-weight: 700;
  color: #2a2a4a;
  text-align: center;
}
.empty-sub {
  font-size: 13;
  color: #1e1e38;
  text-align: center;
  margin-top: 10;
  line-height: 1.6;
}
</style>

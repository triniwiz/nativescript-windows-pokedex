<script lang="ts" setup>
import { ref, watch, computed } from 'nativescript-vue'
import { type PokemonDetail, primaryTypeColor, primaryTypeBg, TYPE_COLORS, STAT_DISPLAY, formatId, capitalize } from '../utils/pokemon'

const props = defineProps<{
  pokemon: PokemonDetail
  loading: boolean
}>()

const animatedPercents = ref<number[]>([])
let animTimer: ReturnType<typeof setInterval> | null = null

function runStatAnimation(stats: PokemonDetail['stats']) {
  if (animTimer) clearInterval(animTimer)
  const targets = stats.map(s => s.percent)

  // Ease the bars to their target over ~12 frames (480ms). A previous 16ms tick re-rendered the
  // panel ~90 times per Pokémon, which thrashed the renderer; 12 frames keeps the motion but cheap.
  const FRAMES = 12
  let frame = 0
  animatedPercents.value = targets.map(() => 0)

  animTimer = setInterval(() => {
    frame++
    const t = Math.min(frame / FRAMES, 1)
    // easeOutCubic for a snappy fill
    const eased = 1 - Math.pow(1 - t, 3)
    animatedPercents.value = targets.map(target => Math.round(target * eased))
    if (t >= 1 && animTimer) {
      clearInterval(animTimer)
      animTimer = null
    }
  }, 40)
}

watch(() => props.pokemon?.id, () => {
  if (props.pokemon) runStatAnimation(props.pokemon.stats)
}, { immediate: true })

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#9E9E9E'
}

function primaryColor(): string {
  return primaryTypeColor(props.pokemon.types)
}

function bgColor(): string {
  return primaryTypeBg(props.pokemon.types)
}

function statColor(percent: number): string {
  if (percent >= 70) return '#4CAF50'
  if (percent >= 40) return '#FF9800'
  return '#F44336'
}

const totalStats = computed(() => props.pokemon.stats.reduce((sum, s) => sum + s.value, 0))
</script>

<template>
  <ScrollView :backgroundColor="bgColor()" class="detail-scroll">
    <StackLayout>

      <!-- Hero -->
      <GridLayout rows="240" :backgroundColor="bgColor()" class="hero-section">
        <Label
          row="0"
          :text="formatId(pokemon.id)"
          class="hero-watermark"
          :color="primaryColor() + '18'"
        />
        <Image
          row="0"
          :src="pokemon.sprite"
          stretch="aspectFit"
          class="hero-image"
        />
      </GridLayout>

      <!-- Name + badges -->
      <StackLayout class="name-section">
        <GridLayout columns="*, auto">
          <Label col="0" :text="pokemon.displayName" class="detail-name" />
          <Label col="1" :text="formatId(pokemon.id)" class="detail-id" />
        </GridLayout>
        <FlexboxLayout flexDirection="row" class="badge-row">
          <Label
            v-for="t in pokemon.types"
            :key="t"
            :text="t.toUpperCase()"
            :backgroundColor="typeColor(t)"
            class="detail-badge"
          />
        </FlexboxLayout>
      </StackLayout>

      <!-- Divider -->
      <ContentView backgroundColor="#0a0a1a" height="1" />

      <!-- Physical stats -->
      <GridLayout columns="*, 1, *" backgroundColor="#0e0e1e" class="phys-row">
        <StackLayout col="0" horizontalAlignment="center">
          <Label text="HEIGHT" class="phys-label" />
          <Label :text="`${pokemon.height.toFixed(1)} m`" class="phys-value" />
        </StackLayout>
        <ContentView col="1" backgroundColor="#1e1e3a" />
        <StackLayout col="2" horizontalAlignment="center">
          <Label text="WEIGHT" class="phys-label" />
          <Label :text="`${pokemon.weight.toFixed(1)} kg`" class="phys-value" />
        </StackLayout>
      </GridLayout>

      <!-- Abilities -->
      <ContentView backgroundColor="#0a0a1a" height="1" />
      <StackLayout backgroundColor="#0e0e1e" class="section">
        <Label text="ABILITIES" class="section-title" />
        <FlexboxLayout flexDirection="row" flexWrap="wrap">
          <Label
            v-for="a in pokemon.abilities"
            :key="a"
            :text="a"
            class="ability-chip"
            :borderColor="primaryColor() + '88'"
          />
        </FlexboxLayout>
      </StackLayout>

      <!-- Base stats -->
      <ContentView backgroundColor="#0a0a1a" height="1" />
      <StackLayout backgroundColor="#0e0e1e" class="section">
        <Label text="BASE STATS" class="section-title" />

        <GridLayout
          v-for="(stat, i) in pokemon.stats"
          :key="stat.name"
          columns="68, *, 38"
          class="stat-row"
        >
          <Label col="0" :text="STAT_DISPLAY[stat.name] ?? stat.name" class="stat-label" />
          <GridLayout col="1" class="stat-track" verticalAlignment="center">
            <ContentView
              horizontalAlignment="left"
              :width="`${Math.round(animatedPercents[i] ?? 0)}%`"
              class="stat-fill"
              :backgroundColor="statColor(stat.percent)"
            />
          </GridLayout>
          <Label col="2" :text="String(stat.value)" class="stat-value" />
        </GridLayout>

        <!-- Total -->
        <GridLayout columns="68, *, 38" class="stat-row total-row">
          <Label col="0" text="TOTAL" class="stat-label total-label" />
          <ContentView col="1" />
          <Label col="2" :text="String(totalStats)" class="stat-value total-value" />
        </GridLayout>
      </StackLayout>

      <!-- Bottom padding -->
      <ContentView backgroundColor="#0e0e1e" height="32" />

    </StackLayout>
  </ScrollView>
</template>

<style>
.detail-scroll {
  height: 100%;
}
.hero-section {
  padding-top: 20;
}
.hero-watermark {
  font-size: 140;
  font-weight: 900;
  text-align: center;
  vertical-align: middle;
}
.hero-image {
  width: 220;
  height: 220;
  horizontal-align: center;
  vertical-align: center;
}
.name-section {
  background-color: #0e0e1e;
  padding: 20 24 16 24;
  border-top-left-radius: 28;
  border-top-right-radius: 28;
  margin-top: -28;
}
.detail-name {
  font-size: 30;
  font-weight: 800;
  color: #f0f0ff;
  vertical-align: middle;
}
.detail-id {
  font-size: 15;
  font-weight: 700;
  color: #3a3a5a;
  vertical-align: bottom;
  text-align: right;
}
.badge-row {
  margin-top: 10;
}
.detail-badge {
  font-size: 11;
  font-weight: 800;
  letter-spacing: 1;
  color: white;
  padding: 4 16;
  border-radius: 14;
  margin-right: 8;
}
.phys-row {
  padding: 20 24;
}
.phys-label {
  font-size: 9;
  font-weight: 800;
  letter-spacing: 2;
  color: #4a4a6a;
  text-align: center;
}
.phys-value {
  font-size: 22;
  font-weight: 700;
  color: #e0e0f0;
  text-align: center;
  margin-top: 4;
}
.section {
  padding: 20 24;
}
.section-title {
  font-size: 9;
  font-weight: 800;
  letter-spacing: 2;
  color: #4a4a6a;
  margin-bottom: 16;
}
.ability-chip {
  font-size: 12;
  font-weight: 600;
  color: #c0c0d8;
  padding: 6 16;
  border-radius: 10;
  border-width: 1;
  margin-right: 8;
  margin-bottom: 8;
  background-color: #14142a;
}
.stat-row {
  margin-bottom: 14;
}
.stat-label {
  font-size: 11;
  font-weight: 700;
  color: #5a5a7a;
  vertical-align: middle;
}
.stat-track {
  height: 8;
  background-color: #1e1e3a;
  border-radius: 4;
  overflow: hidden;
}
.stat-fill {
  height: 8;
  border-radius: 4;
}
.stat-value {
  font-size: 13;
  font-weight: 700;
  color: #c0c0d8;
  text-align: right;
  vertical-align: middle;
}
.total-row {
  margin-top: 6;
  padding-top: 12;
  border-top-width: 1;
  border-top-color: #1a1a32;
}
.total-label {
  font-size: 11;
  font-weight: 800;
  letter-spacing: 1;
  color: #7a7a9a;
}
.total-value {
  font-size: 15;
  font-weight: 800;
  color: #f0f0ff;
}
</style>

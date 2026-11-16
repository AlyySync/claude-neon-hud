import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { TurnStats } from '../types'

// Palette
const CYAN = '#00e5ff'
const MAGENTA = '#ff48c4'
const PURPLE = '#a764ff'
const GREEN = '#50fa7b'
const YELLOW = '#f1fa8c'
const RED = '#ff5555'
const DIM = '#445a86'
const DIM2 = '#2f3b5a'
const WHITE = '#ebebf5'

// Block ASCII CLAUDE — 6 rows x 50 cols
const LOGO: readonly string[] = [
  ' ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗',
  '██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝',
  '██║     ██║     ███████║██║   ██║██║  ██║█████╗  ',
  '██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ',
  '╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗',
  ' ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝',
]
const LOGO_W = 50
const LOGO_H = 6

const PARTICLE_GLYPHS = ['★', '✦', '✧', '⋆', '✴', '✫', '·', '☆'] as const

const turn = atom({ plugin: 'neon-hud', key: 'turn' } as const, {
  seconds: 0,
  tools: 0,
  errors: 0,
  startedAt: null,
} as TurnStats)

const bandHidden = atom(
  { plugin: 'neon-hud', key: 'bandHidden' } as const,
  false,
)

const tick = atom({ plugin: 'neon-hud', key: 'tick' } as const, 0)

const fmtSec = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

const pulseGlyph = (t: number): string => {
  const g = ['◢', '◣', '◤', '◥'] as const
  return g[t % g.length] ?? '◢'
}

// Simple deterministic pseudo-random from an integer seed (xorshift)
const hash = (n: number): number => {
  let x = (n * 2654435761) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b) >>> 0
  x ^= x >>> 13
  return (x * 2246822519) >>> 0
}

// Build one roaming particle row. Stars are spread EVENLY across the width,
// then each drifts horizontally at its own speed and direction.
const particleRow = (
  w: number,
  t: number,
  rowSeed: number,
  count: number,
): string => {
  const row = Array.from({ length: w }, () => ' ')
  for (let i = 0; i < count; i++) {
    const cell = w / count
    const jitter = (hash(rowSeed * 101 + i * 7) % Math.max(1, Math.floor(cell)))
    const base = Math.floor(i * cell + jitter)
    const speed = 1 + (hash(rowSeed + i * 13) % 3)
    const direction = (hash(rowSeed * 3 + i) & 1) === 0 ? 1 : -1
    const pos = (((base + direction * t * speed) % w) + w) % w
    const g =
      PARTICLE_GLYPHS[
        (i + rowSeed + Math.floor(t / 4)) % PARTICLE_GLYPHS.length
      ] ?? '·'
    if (pos < w && row[pos] === ' ') row[pos] = g
  }
  return row.join('')
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hud',
      description: 'Toggle the Neon HUD band',
    })
    // Drive the greeting animation.
    $.clock.every(400, async () => {
      await update($, tick, (t) => (t + 1) & 0x7fffffff)
    })
    return next(e)
  })

  on('command.run', { command: 'hud' }, async ($) => {
    const hidden = await read($, bandHidden)
    await update($, bandHidden, () => !hidden)
    return { text: hidden ? 'HUD band: visible.' : 'HUD band: hidden.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, turn, () => ({
      seconds: 0,
      tools: 0,
      errors: 0,
      startedAt: now,
    }))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await update($, turn, (t) => ({ ...t, tools: t.tools + 1 }))
    const ran = await next(e)
    const isDenied = ran.deny !== undefined
    const isErrored = isDenied || ran.isError === true
    if (isErrored) {
      await update($, turn, (t) => ({ ...t, errors: t.errors + 1 }))
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const t = await read($, turn)
    if (t.startedAt !== null) {
      const now = await $.clock.now()
      const seconds = Math.round((now - t.startedAt) / 1000)
      await update($, turn, (prev) => ({ ...prev, seconds, startedAt: null }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (await read($, bandHidden)) return next(e)
    if (e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const t = await read($, turn)
    const now = await $.clock.now()
    const frame = await read($, tick)
    const bw = e.props.bodyColumns
    const isFresh =
      !e.props.isWorking &&
      t.tools === 0 &&
      t.startedAt === null &&
      t.seconds === 0

    // ─── ANIMATED GREETING ──────────────────────────────────────────────
    if (isFresh) {
      const inner = Math.max(LOGO_W + 4, bw - 2)
      const rule = '═'.repeat(inner)
      const padLeft = Math.max(0, Math.floor((inner - LOGO_W) / 2))
      const padStr = ' '.repeat(padLeft)
      const rightPadLen = Math.max(0, inner - LOGO_W - padLeft)
      // Starfield rows above and below the logo. Band caps at ~half the
      // terminal rows; keep the total under that. 2+6+2+borders+hint = 12.
      // Density scales with width so wide terminals look lively.
      const STAR_ROWS = 2
      const density = Math.max(6, Math.min(16, Math.floor(inner / 14)))
      const starRowsTop = Array.from({ length: STAR_ROWS }, (_, i) =>
        particleRow(inner, frame + i * 3, 100 + i, density),
      )
      const starRowsBot = Array.from({ length: STAR_ROWS }, (_, i) =>
        particleRow(inner, frame + i * 5 + 11, 200 + i, density),
      )

      return (
        <Box flexDirection="column">
          {/* Top edge */}
          <Box>
            <Text color={CYAN} bold>╔</Text>
            <Text color={CYAN}>{rule}</Text>
            <Text color={CYAN} bold>╗</Text>
          </Box>

          {/* Starfield above */}
          {starRowsTop.map((row, i) => (
            <Box key={`st${i}`}>
              <Text color={CYAN} bold>║</Text>
              <Text color={i % 2 === 0 ? CYAN : DIM}>{row}</Text>
              <Text color={CYAN} bold>║</Text>
            </Box>
          ))}

          {/* Logo rows — all cyan */}
          {LOGO.map((line, i) => (
            <Box key={`l${i}`}>
              <Text color={CYAN} bold>║</Text>
              <Text>{padStr}</Text>
              <Text color={CYAN} bold>{line}</Text>
              <Text>{' '.repeat(rightPadLen)}</Text>
              <Text color={CYAN} bold>║</Text>
            </Box>
          ))}

          {/* Starfield below */}
          {starRowsBot.map((row, i) => (
            <Box key={`sb${i}`}>
              <Text color={CYAN} bold>║</Text>
              <Text color={i % 2 === 0 ? DIM : CYAN}>{row}</Text>
              <Text color={CYAN} bold>║</Text>
            </Box>
          ))}

          {/* Bottom edge */}
          <Box>
            <Text color={CYAN} bold>╚</Text>
            <Text color={CYAN}>{rule}</Text>
            <Text color={CYAN} bold>╝</Text>
          </Box>

          {/* Prompt-hint row */}
          <Box>
            <Text color={CYAN} bold>{'  '}❯ </Text>
            <Text color={CYAN} dimColor>type a directive — </Text>
            <Text color={CYAN}>/help</Text>
            <Text color={CYAN} dimColor> for commands</Text>
            <Box flexGrow={1} />
            <Button
              key="hud-hide"
              label="— hide"
              hotkey="h"
              onPress={() => update($, bandHidden, () => true)}
            />
          </Box>
        </Box>
      )
    }

    // ─── COMPACT HUD once a turn has started ────────────────────────────
    const pulse = pulseGlyph(frame)
    const barWidth = 12
    const filled = e.props.isWorking ? (frame % barWidth) + 1 : 0
    const bar = Array.from({ length: barWidth }, (_, i) =>
      i < filled ? '█' : '░',
    ).join('')
    const elapsedMs =
      e.props.isWorking && t.startedAt !== null ? now - t.startedAt : 0

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={CYAN} bold>
          NEXUS
        </Text>
        <Text color={DIM}>∷</Text>
        <Text color={e.props.isWorking ? GREEN : DIM}>
          {e.props.isWorking ? `⟨ ACTIVE ${pulse} ⟩` : '⟨ IDLE ◇ ⟩'}
        </Text>
        <Text color={DIM}>│</Text>
        <Text color={WHITE}>calls </Text>
        <Text color={CYAN} bold>
          {String(t.tools)}
        </Text>
        {t.errors > 0 ? (
          <>
            <Text color={DIM}>│</Text>
            <Text color={RED}>
              err <Text bold>{String(t.errors)}</Text>
            </Text>
          </>
        ) : null}
        <Text color={DIM}>│</Text>
        {e.props.isWorking ? (
          <>
            <Text color={YELLOW} tabular>
              ⧗ {fmtSec(elapsedMs)}
            </Text>
            <Text color={DIM}>⟦</Text>
            <Text color={CYAN}>{bar}</Text>
            <Text color={DIM}>⟧</Text>
          </>
        ) : (
          <Text color={DIM} tabular>
            ⧗ last {fmtSec(t.seconds * 1000)}
          </Text>
        )}
        <Box flexGrow={1} />
        <Button
          key="hud-hide"
          label="— hide"
          hotkey="h"
          onPress={() => update($, bandHidden, () => true)}
        />
      </Box>
    )
  })
}

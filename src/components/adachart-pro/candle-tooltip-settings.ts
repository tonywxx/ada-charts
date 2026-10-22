import { z } from 'zod'
export const candleTooltipSchema = z.object({ position: z.enum(['left', 'right', 'follow']), transparency: z.number().finite().min(0).max(100) }).strict()
export type CandleTooltipSettings = z.infer<typeof candleTooltipSchema>
export const defaultCandleTooltip: CandleTooltipSettings = { position: 'follow', transparency: 30 }

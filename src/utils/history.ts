import type { HomeAssistant } from 'custom-card-helpers';

export interface HistoryDataPoint {
  datetime: string;
  date: Date;
  state: number;
}

/**
 * Fetch historical data for a set of entity IDs over the specified number of hours in the past.
 * Uses Home Assistant WebSocket command `history/history_during_period`.
 */
export async function fetchHistoryFromHass(
  hass: HomeAssistant,
  entityIds: string[],
  hoursInPast: number,
): Promise<Record<string, HistoryDataPoint[]>> {
  const result: Record<string, HistoryDataPoint[]> = {};
  const validEntityIds = Array.from(new Set(entityIds.filter((id) => id && id.trim().length > 0)));
  if (!hass || validEntityIds.length === 0 || hoursInPast <= 0) {
    return result;
  }

  const startTime = new Date(Date.now() - hoursInPast * 3600 * 1000).toISOString();
  const endTime = new Date().toISOString();

  try {
    const rawData = await hass.callWS<Record<string, any[]>>({
      type: 'history/history_during_period',
      start_time: startTime,
      end_time: endTime,
      entity_ids: validEntityIds,
      minimal_response: true,
      no_attributes: true,
    });

    if (!rawData || typeof rawData !== 'object') {
      return result;
    }

    for (const entityId of validEntityIds) {
      const items = rawData[entityId];
      if (!Array.isArray(items)) continue;

      const points: HistoryDataPoint[] = [];

      for (const item of items) {
        if (!item) continue;

        // Parse state value
        const valStr = item.s ?? item.state;
        if (valStr === undefined || valStr === null || valStr === 'unavailable' || valStr === 'unknown') {
          continue;
        }

        const numVal = parseFloat(String(valStr));
        if (isNaN(numVal)) continue;

        // Parse timestamp: lu (seconds or ms), t, last_updated, datetime
        let timestampMs: number | null = null;

        if (typeof item.lu === 'number') {
          timestampMs = item.lu < 1e11 ? item.lu * 1000 : item.lu;
        } else if (item.t) {
          timestampMs = new Date(item.t).getTime();
        } else if (item.last_updated) {
          timestampMs = new Date(item.last_updated).getTime();
        } else if (item.datetime) {
          timestampMs = new Date(item.datetime).getTime();
        }

        if (timestampMs === null || isNaN(timestampMs)) continue;

        const date = new Date(timestampMs);

        points.push({
          datetime: date.toISOString(),
          date,
          state: numVal,
        });
      }

      // Sort chronologically
      points.sort((a, b) => a.date.getTime() - b.date.getTime());

      result[entityId] = points;
    }
  } catch (err) {
    console.warn('Failed to fetch history from Home Assistant WebSocket API:', err);
  }

  return result;
}

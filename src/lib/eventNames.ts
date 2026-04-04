/**
 * Helper functions for working with configurable event names.
 */

export interface EventConfig {
  key: string;
  enabled: boolean;
  name: string;
  dbField: string; // e.g., "ceremony", "reception", "afterparty", "rehearsalDinner"
}

export interface WeddingEventConfig {
  ceremonyEnabled: boolean;
  ceremonyName: string;
  mealEnabled: boolean;
  mealName: string;
  eveningPartyEnabled: boolean;
  eveningPartyName: string;
  rehearsalDinnerEnabled: boolean;
  rehearsalDinnerName: string;
}

/**
 * Get all events with their configuration.
 * Returns only enabled events by default.
 */
export function getEvents(wedding: WeddingEventConfig, includeDisabled = false): EventConfig[] {
  const events: EventConfig[] = [
    {
      key: "rehearsalDinner",
      enabled: wedding.rehearsalDinnerEnabled,
      name: wedding.rehearsalDinnerName || "Rehearsal Dinner",
      dbField: "rehearsalDinner",
    },
    {
      key: "ceremony",
      enabled: wedding.ceremonyEnabled,
      name: wedding.ceremonyName || "Ceremony",
      dbField: "ceremony",
    },
    {
      key: "meal",
      enabled: wedding.mealEnabled,
      name: wedding.mealName || "Wedding Breakfast",
      dbField: "reception", // Maps to invitedToReception in Guest model
    },
    {
      key: "eveningParty",
      enabled: wedding.eveningPartyEnabled,
      name: wedding.eveningPartyName || "Evening Reception",
      dbField: "afterparty", // Maps to invitedToAfterparty in Guest model
    },
  ];

  return includeDisabled ? events : events.filter((e) => e.enabled);
}

/**
 * Get the badge letter for an event (first character of the name, uppercase).
 */
export function getEventBadgeLetter(eventName: string): string {
  return eventName.charAt(0).toUpperCase();
}

/**
 * Map from internal db field names to event keys.
 * This is used when we need to translate from Guest model fields to event config.
 */
export const DB_FIELD_TO_EVENT_KEY: Record<string, string> = {
  ceremony: "ceremony",
  reception: "meal",
  afterparty: "eveningParty",
  rehearsalDinner: "rehearsalDinner",
};

/**
 * Map from event keys to internal db field names.
 */
export const EVENT_KEY_TO_DB_FIELD: Record<string, string> = {
  ceremony: "ceremony",
  meal: "reception",
  eveningParty: "afterparty",
  rehearsalDinner: "rehearsalDinner",
};

/**
 * Default event names (used as fallbacks).
 */
export const DEFAULT_EVENT_NAMES: Record<string, string> = {
  ceremony: "Ceremony",
  meal: "Wedding Breakfast",
  eveningParty: "Evening Reception",
  rehearsalDinner: "Rehearsal Dinner",
};
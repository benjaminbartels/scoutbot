import {
  Client,
  GuildScheduledEvent,
  GuildScheduledEventCreateOptions,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} from "discord.js";
import { calendar_v3, google } from "googleapis";

type NormalizedGoogleEvent = {
  summary: string;
  description: string;
  location: string;
  startTimestamp: number;
  endTimestamp: number;
};

export async function syncEvents(client: Client, guildId: string) {
  const googleEvents = await getGoogleCalendarEvents();
  const discordEvents = await getDiscordEvents(client, guildId);
  const guild = await client.guilds.fetch(guildId);

  const now = Date.now();

  // Convert Google Calendar events into a format for comparison.
  // Skip invalid events and events that already started.
  const googleEventData = googleEvents
    .map(normalizeGoogleEvent)
    .filter((event): event is NormalizedGoogleEvent => event !== null)
    .filter((event) => {
      if (event.startTimestamp < now) {
        console.log(
          `Skipping past event: "${event.summary}", ${event.startTimestamp}, ${event.endTimestamp}`,
        );
        return false;
      }
      return true;
    });

  // Convert Discord events into a comparable format.
  const discordEventData = discordEvents.map((event) => ({
    name: event.name.trim(),
    startTimestamp: event.scheduledStartTimestamp,
    endTimestamp: event.scheduledEndTimestamp,
  }));

  // Add new events to Discord if they don't exist already.
  for (const googleEvent of googleEventData) {
    const matchingDiscordEvent = discordEventData.find(
      (discordEvent) =>
        discordEvent.name === googleEvent.summary &&
        discordEvent.startTimestamp === googleEvent.startTimestamp &&
        discordEvent.endTimestamp === googleEvent.endTimestamp,
    );

    if (!matchingDiscordEvent) {
      const eventOptions: GuildScheduledEventCreateOptions = {
        name: googleEvent.summary,
        scheduledStartTime: new Date(googleEvent.startTimestamp).toISOString(),
        scheduledEndTime: new Date(googleEvent.endTimestamp).toISOString(),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: googleEvent.location || "Online",
        },
        description: googleEvent.description || "No description available.",
      };

      await guild.scheduledEvents.create(eventOptions);
      console.log(
        `Created new event: "${googleEvent.summary}", ${googleEvent.startTimestamp}, ${googleEvent.endTimestamp}`,
      );
    }
  }

  // Remove outdated Discord events that no longer exist in Google Calendar.
  for (const discordEvent of discordEvents) {
    const matchingGoogleEvent = googleEventData.find(
      (googleEvent) =>
        googleEvent.summary === discordEvent.name &&
        googleEvent.startTimestamp === discordEvent.scheduledStartTimestamp &&
        googleEvent.endTimestamp === discordEvent.scheduledEndTimestamp,
    );

    if (!matchingGoogleEvent) {
      await discordEvent.delete();
      console.log(
        `Deleted event: "${discordEvent.name}", ${discordEvent.scheduledStartTimestamp}, ${discordEvent.scheduledEndTimestamp}`,
      );
    }
  }

  console.log("Events synced successfully");
}

function normalizeGoogleEvent(
  event: calendar_v3.Schema$Event,
): NormalizedGoogleEvent | null {
  if (!event.summary?.trim()) {
    console.log("Skipping Google event without a summary");
    return null;
  }

  const summary = event.summary.trim();
  const description = event.description || "No description available.";
  const location = event.location || "Online";

  let startTimestamp: number | undefined;
  let endTimestamp: number | undefined;

  // Timed event
  if (event.start?.dateTime) {
    startTimestamp = new Date(event.start.dateTime).getTime();

    if (event.end?.dateTime) {
      endTimestamp = new Date(event.end.dateTime).getTime();
    } else {
      // Fallback: default to 1 hour duration if Google omitted an end datetime
      endTimestamp = startTimestamp + 60 * 60 * 1000;
    }
  }
  // All-day event
  else if (event.start?.date) {
    // Google all-day events use an exclusive end date.
    // Example:
    // start.date = 2026-06-20
    // end.date   = 2026-06-21
    startTimestamp = new Date(`${event.start.date}T00:00:00`).getTime();

    if (event.end?.date) {
      endTimestamp = new Date(`${event.end.date}T00:00:00`).getTime();
    } else {
      // Fallback to a one-day all-day event
      const startDate = new Date(`${event.start.date}T00:00:00`);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      endTimestamp = endDate.getTime();
    }
  }

  if (
    startTimestamp === undefined ||
    endTimestamp === undefined ||
    Number.isNaN(startTimestamp) ||
    Number.isNaN(endTimestamp)
  ) {
    console.log(`Skipping invalid Google event: "${summary}"`);
    return null;
  }

  if (endTimestamp <= startTimestamp) {
    console.log(`Skipping event with invalid time range: "${summary}"`);
    return null;
  }

  return {
    summary,
    description,
    location,
    startTimestamp,
    endTimestamp,
  };
}

async function getGoogleCalendarEvents() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const calendarId = process.env.CALENDAR_ID;
    const calendar = google.calendar({ version: "v3", auth: apiKey });

    const start = new Date();
    const end = new Date(+start);
    end.setDate(end.getDate() + 90);

    const response = await calendar.events.list({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      maxResults: 100,
      singleEvents: true,
      orderBy: "startTime",
    });

    return response.data.items || [];
  } catch (error) {
    console.error("Error accessing Google Calendar:", error);
    return [];
  }
}

async function getDiscordEvents(
  client: Client,
  guildId: string,
): Promise<GuildScheduledEvent[]> {
  const guild = await client.guilds.fetch(guildId);

  if (!guild) {
    console.error("Guild not found");
    return [];
  }

  const scheduledEvents = await guild.scheduledEvents.fetch();
  return Array.from(scheduledEvents.values());
}

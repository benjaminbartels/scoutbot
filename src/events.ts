import {
  Client,
  GuildScheduledEvent,
  GuildScheduledEventCreateOptions,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} from "discord.js";
import { google } from "googleapis";

export async function syncEvents(client: Client, guildId: string) {
  const googleEvents = await getGoogleCalendarEvents();
  const discordEvents = await getDiscordEvents(client, guildId);

  const guild = await client.guilds.fetch(guildId);

  // Convert Google Calendar events into a format for comparison (timestamps for start and end)
  const googleEventData = googleEvents.map((event) => ({
    summary: event.summary!.trim(),
    startTimestamp: new Date(
      event.start?.dateTime || event.start?.date!
    ).getTime(),
    endTimestamp: event.end?.dateTime
      ? new Date(event.end.dateTime).getTime()
      : undefined,
  }));

  // Convert Discord events into a comparable format (timestamps)
  const discordEventData = discordEvents.map((event) => ({
    name: event.name.trim(),
    startTimestamp: event.scheduledStartTimestamp,
    endTimestamp: event.scheduledEndTimestamp,
  }));

  // Add new events to Discord if they don't exist or are different
  for (const googleEvent of googleEventData) {
    const matchingDiscordEvent = discordEventData.find(
      (discordEvent) =>
        discordEvent.name === googleEvent.summary &&
        discordEvent.startTimestamp === googleEvent.startTimestamp &&
        discordEvent.endTimestamp === googleEvent.endTimestamp
    );

    // If no matching event is found, create a new one in Discord
    if (!matchingDiscordEvent) {
      const eventOptions: GuildScheduledEventCreateOptions = {
        name: googleEvent.summary,
        scheduledStartTime: new Date(googleEvent.startTimestamp).toISOString(),
        scheduledEndTime: googleEvent.endTimestamp
          ? new Date(googleEvent.endTimestamp).toISOString()
          : undefined,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: "Online", // You can customize this if necessary
        },
        description: "Event synced from Google Calendar.",
      };

      await guild.scheduledEvents.create(eventOptions);
      console.log(
        `Created new event: "${googleEvent.summary}", ${googleEvent.startTimestamp}, ${googleEvent.endTimestamp}`
      );
    }
  }

  // Remove outdated Discord events that no longer exist in Google Calendar
  for (const discordEvent of discordEvents) {
    const matchingGoogleEvent = googleEventData.find(
      (googleEvent) =>
        googleEvent.summary === discordEvent.name &&
        googleEvent.startTimestamp === discordEvent.scheduledStartTimestamp &&
        googleEvent.endTimestamp === discordEvent.scheduledEndTimestamp
    );

    // If no matching Google event is found, delete the event from Discord
    if (!matchingGoogleEvent) {
      await discordEvent.delete();
      console.log(
        `Deleted event: "${discordEvent.name}", ${discordEvent.scheduledStartTimestamp}, ${discordEvent.scheduledEndTimestamp}`
      );
    }
  }

  console.log("Events synced successfully");
}

async function getGoogleCalendarEvents() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const calendarId = process.env.CALENDAR_ID;

    const calendar = google.calendar({ version: "v3", auth: apiKey });
    var start = new Date();
    var end = new Date(+start);
    end.setDate(end.getDate() + 30);

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
  guildId: string
): Promise<GuildScheduledEvent[]> {
  const guild = await client.guilds.fetch(guildId);

  if (!guild) {
    console.error("Guild not found");
    return [];
  }

  // Fetch scheduled events from the guild
  const scheduledEvents = await guild.scheduledEvents.fetch();
  return Array.from(scheduledEvents.values());
}

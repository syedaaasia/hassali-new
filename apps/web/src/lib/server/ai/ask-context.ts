import {
  classifyAskIntent,
  createAskSeriousAnswer,
  type AskConversationMessage
} from "./ask-serious-assistant";

export type AskCapability = "calculator" | "current_time" | "file_context" | "weather" | "web_search";

export type AskRuntimeContext = {
  capabilities: Record<AskCapability, boolean>;
  currentIsoDatetime: string;
  currentReadableDate: string;
  currentReadableTime: string;
  serverTimezone: string;
  timezoneNote: string;
};

export type AskLiveIntent =
  | "build_request"
  | "current_time"
  | "general"
  | "live_current_info"
  | "weather";

type TimezoneMatch = {
  label: string;
  source: "default" | "recognized" | "unknown";
  timezone: string;
};

type WeatherLocation = {
  country?: string;
  latitude: number;
  longitude: number;
  name: string;
  timezone?: string;
};

type OpenMeteoWeatherResponse = {
  current?: {
    apparent_temperature?: number;
    cloud_cover?: number;
    interval?: number;
    is_day?: number;
    precipitation?: number;
    relative_humidity_2m?: number;
    temperature_2m?: number;
    time?: string;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  current_units?: Record<string, string>;
  timezone?: string;
};

const liveCurrentPatterns = [
  /\b(?:latest|current|right now|today|tomorrow|yesterday)\b/i,
  /\b(?:news|headline|headlines|sports score|score|exchange rate|stock price|crypto price|availability)\b/i,
  /\b(?:current law|current regulation|new regulation|company status|provider status|model status)\b/i
];

const timezoneAliases: Record<string, string> = {
  "america/new york": "America/New_York",
  "asia/kolkata": "Asia/Kolkata",
  bangkok: "Asia/Bangkok",
  dubai: "Asia/Dubai",
  faisalabad: "Asia/Karachi",
  gmt: "UTC",
  "gujranwala": "Asia/Karachi",
  hyderabad: "Asia/Karachi",
  "hyderabad india": "Asia/Kolkata",
  "hyderabad pakistan": "Asia/Karachi",
  islamabad: "Asia/Karachi",
  india: "Asia/Kolkata",
  karachi: "Asia/Karachi",
  lahore: "Asia/Karachi",
  london: "Europe/London",
  multan: "Asia/Karachi",
  "new york": "America/New_York",
  pakistan: "Asia/Karachi",
  peshawar: "Asia/Karachi",
  quetta: "Asia/Karachi",
  rawalpindi: "Asia/Karachi",
  "asia/islamabad": "Asia/Karachi",
  sialkot: "Asia/Karachi",
  sukkur: "Asia/Karachi",
  thailand: "Asia/Bangkok",
  toronto: "America/Toronto",
  uae: "Asia/Dubai",
  uk: "Europe/London",
  utc: "UTC"
};

const weatherLocationHints: Record<string, WeatherLocation> = {
  bangkok: {
    country: "Thailand",
    latitude: 13.7563,
    longitude: 100.5018,
    name: "Bangkok",
    timezone: "Asia/Bangkok"
  },
  dubai: {
    country: "United Arab Emirates",
    latitude: 25.2048,
    longitude: 55.2708,
    name: "Dubai",
    timezone: "Asia/Dubai"
  },
  faisalabad: {
    country: "Pakistan",
    latitude: 31.4504,
    longitude: 73.135,
    name: "Faisalabad",
    timezone: "Asia/Karachi"
  },
  gujranwala: {
    country: "Pakistan",
    latitude: 32.1877,
    longitude: 74.1945,
    name: "Gujranwala",
    timezone: "Asia/Karachi"
  },
  hyderabad: {
    country: "Pakistan",
    latitude: 25.396,
    longitude: 68.3578,
    name: "Hyderabad",
    timezone: "Asia/Karachi"
  },
  "hyderabad india": {
    country: "India",
    latitude: 17.385,
    longitude: 78.4867,
    name: "Hyderabad",
    timezone: "Asia/Kolkata"
  },
  "hyderabad pakistan": {
    country: "Pakistan",
    latitude: 25.396,
    longitude: 68.3578,
    name: "Hyderabad",
    timezone: "Asia/Karachi"
  },
  islamabad: {
    country: "Pakistan",
    latitude: 33.6844,
    longitude: 73.0479,
    name: "Islamabad",
    timezone: "Asia/Karachi"
  },
  karachi: {
    country: "Pakistan",
    latitude: 24.8607,
    longitude: 67.0011,
    name: "Karachi",
    timezone: "Asia/Karachi"
  },
  lahore: {
    country: "Pakistan",
    latitude: 31.5204,
    longitude: 74.3587,
    name: "Lahore",
    timezone: "Asia/Karachi"
  },
  london: {
    country: "United Kingdom",
    latitude: 51.5072,
    longitude: -0.1276,
    name: "London",
    timezone: "Europe/London"
  },
  multan: {
    country: "Pakistan",
    latitude: 30.1575,
    longitude: 71.5249,
    name: "Multan",
    timezone: "Asia/Karachi"
  },
  "new york": {
    country: "United States",
    latitude: 40.7128,
    longitude: -74.006,
    name: "New York",
    timezone: "America/New_York"
  },
  peshawar: {
    country: "Pakistan",
    latitude: 34.0151,
    longitude: 71.5249,
    name: "Peshawar",
    timezone: "Asia/Karachi"
  },
  quetta: {
    country: "Pakistan",
    latitude: 30.1798,
    longitude: 66.975,
    name: "Quetta",
    timezone: "Asia/Karachi"
  },
  rawalpindi: {
    country: "Pakistan",
    latitude: 33.5651,
    longitude: 73.0169,
    name: "Rawalpindi",
    timezone: "Asia/Karachi"
  },
  sialkot: {
    country: "Pakistan",
    latitude: 32.4945,
    longitude: 74.5229,
    name: "Sialkot",
    timezone: "Asia/Karachi"
  },
  sukkur: {
    country: "Pakistan",
    latitude: 27.7052,
    longitude: 68.8574,
    name: "Sukkur",
    timezone: "Asia/Karachi"
  },
  toronto: {
    country: "Canada",
    latitude: 43.6532,
    longitude: -79.3832,
    name: "Toronto",
    timezone: "America/Toronto"
  }
};

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const monthNames: Record<string, number> = {
  april: 3,
  apr: 3,
  august: 7,
  aug: 7,
  december: 11,
  dec: 11,
  february: 1,
  feb: 1,
  january: 0,
  jan: 0,
  july: 6,
  jul: 6,
  june: 5,
  jun: 5,
  march: 2,
  mar: 2,
  may: 4,
  november: 10,
  nov: 10,
  october: 9,
  oct: 9,
  september: 8,
  sep: 8,
  sept: 8
};

function resolveTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "UTC";
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function canonicalTimezoneCandidate(value: string) {
  return value
    .split("/")
    .map((part) =>
      part
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join("_")
    )
    .join("/");
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[?.!,]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildAskRuntimeContext(now = new Date()): AskRuntimeContext {
  const serverTimezone = resolveTimezone();
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: serverTimezone
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: serverTimezone,
    timeZoneName: "short"
  });

  return {
    capabilities: {
      calculator: false,
      current_time: true,
      file_context: true,
      weather: true,
      web_search: false
    },
    currentIsoDatetime: now.toISOString(),
    currentReadableDate: dateFormatter.format(now),
    currentReadableTime: timeFormatter.format(now),
    serverTimezone,
    timezoneNote:
      serverTimezone === "UTC"
        ? "Server timezone resolved to UTC. Treat date/time as server runtime time unless the user specifies another timezone."
        : "Date/time comes from the server runtime timezone."
  };
}

export function detectAskLiveIntent(prompt: string): AskLiveIntent {
  const normalized = prompt.trim().toLowerCase();
  const askIntent = classifyAskIntent(prompt);

  if (
    askIntent.intent !== "date_time_question" &&
    askIntent.intent !== "wrong_mode_build_request" &&
    askIntent.intent !== "general_answer"
  ) {
    return "general";
  }

  if (/\b(?:weather|temperature|temp|forecast|rain|humidity|humid|hot|cold)\b/i.test(normalized)) {
    return "weather";
  }

  if (
    askIntent.intent === "date_time_question" ||
    /\b(?:what date is today|today'?s date|today date|current date|what day is it|what time is it|current time|time now|date today)\b/i.test(
      normalized
    )
  ) {
    return "current_time";
  }

  if (
    askIntent.intent === "wrong_mode_build_request" ||
    /\b(?:create|build|generate|design|make|edit|update)\b[\s\S]{0,80}\b(?:website|site|app|tool|system|file|files|code)\b/i.test(
      prompt
    )
  ) {
    return "build_request";
  }

  if (liveCurrentPatterns.some((pattern) => pattern.test(prompt))) {
    return "live_current_info";
  }

  return "general";
}

function getTimezoneMatch(prompt: string, context: AskRuntimeContext): TimezoneMatch {
  const ianaMatch = prompt.match(/\b(?:[A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?|UTC|GMT)\b/i);

  if (ianaMatch) {
    const raw = ianaMatch[0];
    const alias = timezoneAliases[normalizeLookup(raw)];
    const candidate = alias ?? (raw.toUpperCase() === "UTC" || raw.toUpperCase() === "GMT"
      ? "UTC"
      : canonicalTimezoneCandidate(raw));

    if (isValidTimezone(candidate)) {
      return {
        label: raw,
        source: "recognized",
        timezone: candidate
      };
    }

    return {
      label: raw,
      source: "unknown",
      timezone: context.serverTimezone
    };
  }

  const normalized = normalizeLookup(prompt);
  const sortedAliases = Object.keys(timezoneAliases).sort((a, b) => b.length - a.length);
  const matchedAlias = sortedAliases.find((alias) => new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(normalized));

  if (matchedAlias) {
    return {
      label: titleCaseLocation(matchedAlias),
      source: "recognized",
      timezone: timezoneAliases[matchedAlias]
    };
  }

  const locationPhrase = prompt.match(/\b(?:in|for|at)\s+([A-Za-z][A-Za-z\s_/-]{1,40})(?:[?.!,]|$)/i);
  const location = normalizeLookup(locationPhrase?.[1] ?? "");

  if (location && !/^(?:the|a|an|this|that|my|your|it|now|today|tomorrow|yesterday)$/.test(location)) {
    return {
      label: locationPhrase?.[1]?.trim() ?? location,
      source: "unknown",
      timezone: context.serverTimezone
    };
  }

  return {
    label: context.serverTimezone,
    source: "default",
    timezone: context.serverTimezone
  };
}

function isSimpleDateTimeQuestion(prompt: string) {
  const normalized = prompt.trim().toLowerCase().replace(/[?.!]+$/g, "");

  return (
    /^(?:what(?:'s| is)?|tell me)?\s*(?:the\s*)?(?:date|day|time)\s*(?:today|now|right now|is it)?(?:\s+(?:in|for|at)\s+[\w\s/_-]+)?$/.test(normalized) ||
    /\b(?:what date is today|today'?s date|today date|current date|what day is it|what time is it|current time|time now|date today)\b/i.test(
      prompt
    )
  );
}

function formatDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: timezone
  }).format(date);
}

function formatTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    timeZoneName: "short"
  }).format(date);
}

function getDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: timezone,
    weekday: "long",
    year: "numeric"
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? 1),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
    weekday: parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "sunday",
    year: Number(parts.find((part) => part.type === "year")?.value ?? 1970)
  };
}

function addDaysInTimezone(now: Date, timezone: string, offsetDays: number) {
  const parts = getDateParts(now, timezone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays, 12, 0, 0));
}

function parseExplicitDate(prompt: string, context: AskRuntimeContext, timezone: string) {
  const currentYear = getDateParts(new Date(context.currentIsoDatetime), timezone).year;
  const monthFirst = prompt.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i
  );
  const dayFirst = prompt.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s+(\d{4}))?\b/i
  );

  if (monthFirst) {
    const month = monthNames[monthFirst[1].toLowerCase()];
    const day = Number(monthFirst[2]);
    const year = Number(monthFirst[3] ?? currentYear);

    return Number.isFinite(month) && day >= 1 && day <= 31
      ? new Date(Date.UTC(year, month, day, 12, 0, 0))
      : null;
  }

  if (dayFirst) {
    const month = monthNames[dayFirst[2].toLowerCase()];
    const day = Number(dayFirst[1]);
    const year = Number(dayFirst[3] ?? currentYear);

    return Number.isFinite(month) && day >= 1 && day <= 31
      ? new Date(Date.UTC(year, month, day, 12, 0, 0))
      : null;
  }

  return null;
}

function relativeDateAnswer(prompt: string, context: AskRuntimeContext, timezone: string, label: string) {
  const normalized = prompt.toLowerCase();
  const now = new Date(context.currentIsoDatetime);
  const daysAgo = normalized.match(/\b(\d+)\s+days?\s+ago\b/);
  const daysFromNow = normalized.match(/\b(?:in\s+)?(\d+)\s+days?\s+(?:from now|later)\b/);
  const explicitDate = parseExplicitDate(prompt, context, timezone);
  const nextLastWeekday = normalized.match(/\b(next|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);

  if (daysAgo) {
    const targetDate = addDaysInTimezone(now, timezone, -Number(daysAgo[1]));
    return `${Number(daysAgo[1])} days ago in ${label} was ${formatDate(targetDate, timezone)} (${timezone}).`;
  }

  if (/\byesterday\b/i.test(prompt)) {
    const targetDate = addDaysInTimezone(now, timezone, -1);
    return `Yesterday in ${label} was ${formatDate(targetDate, timezone)} (${timezone}).`;
  }

  if (/\btomorrow\b/i.test(prompt)) {
    const targetDate = addDaysInTimezone(now, timezone, 1);
    return `Tomorrow in ${label} is ${formatDate(targetDate, timezone)} (${timezone}).`;
  }

  if (daysFromNow) {
    const targetDate = addDaysInTimezone(now, timezone, Number(daysFromNow[1]));
    return `${Number(daysFromNow[1])} days from now in ${label} is ${formatDate(targetDate, timezone)} (${timezone}).`;
  }

  if (nextLastWeekday) {
    const direction = nextLastWeekday[1];
    const targetWeekday = weekdays.indexOf(nextLastWeekday[2]);
    const currentWeekday = weekdays.indexOf(getDateParts(now, timezone).weekday);
    const forwardDelta = (targetWeekday - currentWeekday + 7) % 7 || 7;
    const backwardDelta = -((currentWeekday - targetWeekday + 7) % 7 || 7);
    const targetDate = addDaysInTimezone(now, timezone, direction === "next" ? forwardDelta : backwardDelta);

    return `${capitalize(direction)} ${capitalize(nextLastWeekday[2])} in ${label} is ${formatDate(targetDate, timezone)} (${timezone}).`;
  }

  if (explicitDate && /\b(?:what\s+day|which\s+day|day\s+was|day\s+is)\b/i.test(prompt)) {
    return `${formatDate(explicitDate, timezone)} was a ${new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long"
    }).format(explicitDate)} (${timezone}).`;
  }

  return null;
}

function extractWeatherLocationPhrase(prompt: string) {
  const weatherTerms = "(?:weather|temperature|temp|forecast|rain|humidity|humid|hot|cold)";
  const hotCold = prompt.match(/\bhow\s+(?:hot|cold)\s+is\s+([A-Za-z][A-Za-z\s,_-]{1,50})(?:[?.!,]|$)/i);
  const explicit = prompt.match(
    new RegExp(`\\b${weatherTerms}\\b(?:\\s+today)?\\s*(?:in|for|at|of)?\\s+([A-Za-z][A-Za-z\\s,_-]{1,50})(?:[?.!,]|$)`, "i")
  );
  const trailing = prompt.match(/\b(?:in|for|at)\s+([A-Za-z][A-Za-z\s,_-]{1,50})(?:[?.!,]|$)/i);
  const leading = prompt.match(
    new RegExp(`\\b([A-Za-z][A-Za-z\\s,_-]{1,50})\\s+${weatherTerms}\\b(?:\\s+today)?(?:[?.!,]|$)`, "i")
  );
  const raw = hotCold?.[1] ?? leading?.[1] ?? explicit?.[1] ?? trailing?.[1] ?? "";

  return normalizeLookup(
    raw
      .replace(/\b(?:today|right now|now|current|please|kindly|the)\b/gi, " ")
      .replace(/\b(?:weather|temperature|temp|forecast|rain|humidity|humid|hot|cold)\b/gi, " ")
  );
}

async function resolveWeatherLocation(prompt: string): Promise<WeatherLocation | null> {
  const locationPhrase = extractWeatherLocationPhrase(prompt);

  if (!locationPhrase) {
    return null;
  }

  const hinted = weatherLocationHints[locationPhrase];

  if (hinted) {
    return hinted;
  }

  return null;
}

function weatherCodeDescription(code: number | undefined) {
  if (code === undefined) {
    return "current conditions";
  }

  if (code === 0) return "clear sky";
  if ([1, 2, 3].includes(code)) return "partly cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunderstorm";

  return "current conditions";
}

async function createWeatherAnswer(prompt: string) {
  try {
    const location = await resolveWeatherLocation(prompt);

    if (!location) {
      return (
        "I can check live weather, but I could not recognize the requested location. " +
        "Please give a city/country or an IANA timezone-style location, such as Karachi, Bangkok, Dubai, London, or New York."
      );
    }

    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=${encodeURIComponent(location.timezone ?? "auto")}`
    );

    if (!weatherResponse.ok) {
      throw new Error(`Open-Meteo returned ${weatherResponse.status}`);
    }

    const weather = (await weatherResponse.json()) as OpenMeteoWeatherResponse;
    const current = weather.current;

    if (!current || typeof current.temperature_2m !== "number") {
      throw new Error("Open-Meteo response did not include current temperature");
    }

    const unit = weather.current_units?.temperature_2m ?? "°C";
    const feelsUnit = weather.current_units?.apparent_temperature ?? unit;
    const windUnit = weather.current_units?.wind_speed_10m ?? "km/h";
    const humidityUnit = weather.current_units?.relative_humidity_2m ?? "%";
    const place = `${location.name}${location.country ? `, ${location.country}` : ""}`;
    const timestamp = current.time ? ` at ${current.time}` : "";

    return (
      `The live weather in ${place}${timestamp} is ${Math.round(current.temperature_2m)}${unit} ` +
      `(${weatherCodeDescription(current.weather_code)}). ` +
      `Feels like ${Math.round(current.apparent_temperature ?? current.temperature_2m)}${feelsUnit}, ` +
      `humidity ${Math.round(current.relative_humidity_2m ?? 0)}${humidityUnit}, ` +
      `wind ${Math.round(current.wind_speed_10m ?? 0)} ${windUnit}. ` +
      "Source: Open-Meteo live forecast API."
    );
  } catch {
    return (
      "Live weather lookup is connected, but the provider could not be reached or returned incomplete data right now. " +
      "I will not guess the current temperature. Please retry, or ask me for a non-live climate estimate."
    );
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleCaseLocation(value: string) {
  return value
    .split(" ")
    .map((part) => capitalize(part))
    .join(" ");
}

export function createDeterministicAskAnswer(
  prompt: string,
  context: AskRuntimeContext,
  history?: AskConversationMessage[]
): string | null {
  const seriousAnswer = createAskSeriousAnswer(prompt, context, history);

  if (seriousAnswer) {
    return seriousAnswer;
  }

  const intent = detectAskLiveIntent(prompt);
  const asksForTime = /\b(?:time|now|right now)\b/i.test(prompt);
  const asksForDay = /\b(?:day)\b/i.test(prompt);
  const timezoneMatch = getTimezoneMatch(prompt, context);
  const requestedTimezone = timezoneMatch.timezone;
  const label = timezoneMatch.source === "default" ? requestedTimezone : timezoneMatch.label;
  const relativeAnswer = relativeDateAnswer(prompt, context, requestedTimezone, label);
  const simpleDateTimeQuestion = isSimpleDateTimeQuestion(prompt);

  if ((intent === "current_time" || relativeAnswer || simpleDateTimeQuestion) && timezoneMatch.source === "unknown") {
    return (
      `I could not recognize "${timezoneMatch.label}" as a supported timezone or location. ` +
      "Please use a city/country or an IANA timezone like Asia/Bangkok, Asia/Karachi, Europe/London, or America/New_York."
    );
  }

  if (relativeAnswer) {
    return relativeAnswer;
  }

  if (intent === "current_time" || simpleDateTimeQuestion) {
    if (asksForTime) {
      const prefix = timezoneMatch.source === "default"
        ? "The current time is"
        : `The current time in ${timezoneMatch.label} is`;

      return `${prefix} ${formatTime(new Date(context.currentIsoDatetime), requestedTimezone)} on ${formatDate(new Date(context.currentIsoDatetime), requestedTimezone)} (${requestedTimezone}).`;
    }

    if (asksForDay) {
      const prefix = timezoneMatch.source === "default"
        ? "Today is"
        : `Today in ${timezoneMatch.label} is`;

      return `${prefix} ${formatDate(new Date(context.currentIsoDatetime), requestedTimezone)} (${requestedTimezone}).`;
    }

    const prefix = timezoneMatch.source === "default"
      ? "Today's date is"
      : `Today's date in ${timezoneMatch.label} is`;

    return `${prefix} ${formatDate(new Date(context.currentIsoDatetime), requestedTimezone)} (${requestedTimezone}).`;
  }

  if (intent === "weather") {
    return (
      "Live weather lookup is connected, but this request needs the weather handler. " +
      "If you see this message, please retry the same weather question once."
    );
  }

  if (intent === "build_request") {
    return (
      "ASK mode is for explanations, planning, and guidance, so I will not mutate files from here. " +
      "Switch to WEBSITE for website creation/editing or CODE for apps, tools, systems, and code changes."
    );
  }

  if (intent === "live_current_info") {
    return (
      "I do not have live web/search data connected inside Hassali yet for that kind of current information. " +
      "I can explain the topic generally, but I should not claim the latest facts without a live provider."
    );
  }

  return null;
}

export async function createAskDirectAnswer(
  prompt: string,
  context: AskRuntimeContext,
  history?: AskConversationMessage[]
): Promise<string | null> {
  const intent = detectAskLiveIntent(prompt);

  if (intent === "weather") {
    return createWeatherAnswer(prompt);
  }

  return createDeterministicAskAnswer(prompt, context, history);
}

export function formatAskRuntimeContext(context: AskRuntimeContext, intent: AskLiveIntent) {
  return [
    `Current date/time is: ${context.currentReadableDate}, ${context.currentReadableTime}.`,
    `Current ISO datetime: ${context.currentIsoDatetime}.`,
    `Server timezone: ${context.serverTimezone}. ${context.timezoneNote}`,
    `ASK live-info intent: ${intent}.`,
    `Tool capabilities: current_time=${context.capabilities.current_time}, weather=${context.capabilities.weather}, web_search=${context.capabilities.web_search}, calculator=${context.capabilities.calculator}, file_context=${context.capabilities.file_context}.`,
    "Trust policy: never present stale model knowledge, guesses, or climate averages as current/live facts. If live data is unavailable, say so clearly."
  ].join("\n");
}

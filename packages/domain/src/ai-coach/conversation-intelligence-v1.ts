import type {
  CoachContextV1,
} from "./coach-context-v1";

export const COACH_CONVERSATION_CONTEXT_V1_VERSION =
  "coach-conversation-context-v1" as const;

export const COACH_CONVERSATION_MAX_EXCHANGES_V1 = 3;
export const COACH_CONVERSATION_MAX_TURNS_V1 = 6;
export const COACH_CONVERSATION_TURN_MAX_LENGTH_V1 = 1_200;
export const COACH_CONVERSATION_TOTAL_MAX_LENGTH_V1 = 7_200;
export const COACH_CONVERSATION_CURRENT_MESSAGE_MAX_LENGTH_V1 = 2_000;

export type CoachConversationRoleV1 =
  | "user"
  | "assistant";

export interface CoachConversationTurnV1 {
  readonly role: CoachConversationRoleV1;
  readonly text: string;
}

export interface CoachConversationInputV1 {
  readonly version:
    typeof COACH_CONVERSATION_CONTEXT_V1_VERSION;

  readonly recentTurns:
    readonly CoachConversationTurnV1[];
}

export type CoachConversationReferentV1 =
  | Readonly<{
      kind: "subject";
      subjectId: string;
      fingerprint: string;
    }>
  | Readonly<{
      kind: "planner";
      fingerprint: string;
    }>;

export type CoachConversationResolutionV1 =
  | Readonly<{
      status: "none";
      referent: null;
      provenance: null;
    }>
  | Readonly<{
      status: "ambiguous";
      referent: null;
      provenance:
        | "current_message"
        | `recent_user_turn:${number}`;
    }>
  | Readonly<{
      status: "resolved";
      referent: CoachConversationReferentV1;
      provenance:
        | "current_message"
        | `recent_user_turn:${number}`;
    }>;

export interface CoachConversationLanguageContextV1 {
  readonly version:
    typeof COACH_CONVERSATION_CONTEXT_V1_VERSION;

  readonly authority:
    "non_authoritative_language_context";

  readonly currentMessage:
    string;

  readonly recentTurns:
    readonly CoachConversationTurnV1[];

  readonly resolution:
    CoachConversationResolutionV1;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    value !== null
    && typeof value === "object"
    && !Object.isFrozen(value)
  ) {
    Object.freeze(value);

    for (
      const child
      of Object.values(
        value as Record<string, unknown>,
      )
    ) {
      deepFreeze(child);
    }
  }

  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    JSON.stringify(
      Object.keys(value).sort(),
    )
    === JSON.stringify(
      [...keys].sort(),
    )
  );
}

function normalizeText(
  value: unknown,
  maxLength: number,
  errorCode: string,
): string {
  if (typeof value !== "string") {
    throw new Error(errorCode);
  }

  const normalized =
    value
      .normalize("NFC")
      .trim();

  if (
    !normalized
    || [...normalized].length > maxLength
    || /[\u0000-\u001f\u007f]/u.test(
      normalized,
    )
  ) {
    throw new Error(errorCode);
  }

  return normalized;
}

function searchableMessage(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("\u0131", "i")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCoachConversationFollowUpV1(
  rawMessage: string,
): boolean {
  const message =
    searchableMessage(rawMessage);

  return (
    /^(peki|peki neden|neden|neden boyle|nasil yani|ne demek|devam et)$/
      .test(message)
    || message
      === "biraz daha aciklar misin"
    || message
      === "biraz daha acikla"
    || message
      === "bunu biraz daha acikla"
    || message
      === "onu biraz daha acikla"
  );
}

export function parseCoachConversationInputV1(
  value: unknown,
): CoachConversationInputV1 | null {
  if (
    value === undefined
    || value === null
  ) {
    return null;
  }

  if (
    !isRecord(value)
    || !exactKeys(
      value,
      [
        "version",
        "recentTurns",
      ],
    )
    || value.version
      !== COACH_CONVERSATION_CONTEXT_V1_VERSION
    || !Array.isArray(
      value.recentTurns,
    )
  ) {
    throw new Error(
      "COACH_CONVERSATION_CONTEXT_INVALID",
    );
  }

  if (
    value.recentTurns.length
      > COACH_CONVERSATION_MAX_TURNS_V1
    || value.recentTurns.length % 2
      !== 0
  ) {
    throw new Error(
      "COACH_CONVERSATION_TURN_COUNT_INVALID",
    );
  }

  let totalLength = 0;

  const recentTurns =
    value.recentTurns.map(
      (candidate, index) => {
        if (
          !isRecord(candidate)
          || !exactKeys(
            candidate,
            [
              "role",
              "text",
            ],
          )
        ) {
          throw new Error(
            "COACH_CONVERSATION_TURN_INVALID",
          );
        }

        const expectedRole =
          index % 2 === 0
            ? "user"
            : "assistant";

        if (
          candidate.role
            !== expectedRole
        ) {
          throw new Error(
            "COACH_CONVERSATION_TURN_ORDER_INVALID",
          );
        }

        const text =
          normalizeText(
            candidate.text,
            COACH_CONVERSATION_TURN_MAX_LENGTH_V1,
            "COACH_CONVERSATION_TURN_TEXT_INVALID",
          );

        totalLength +=
          [...text].length;

        return {
          role:
            expectedRole,
          text,
        } as const;
      },
    );

  if (
    totalLength
      > COACH_CONVERSATION_TOTAL_MAX_LENGTH_V1
  ) {
    throw new Error(
      "COACH_CONVERSATION_TOTAL_LENGTH_INVALID",
    );
  }

  return deepFreeze({
    version:
      COACH_CONVERSATION_CONTEXT_V1_VERSION,
    recentTurns,
  });
}

function canonicalize(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          (key) => [
            key,
            canonicalize(
              value[key],
            ),
          ],
        ),
    );
  }

  return value;
}

async function sha256(
  value: unknown,
): Promise<string> {
  const bytes =
    new TextEncoder().encode(
      JSON.stringify(
        canonicalize(value),
      ),
    );

  const digest =
    await globalThis.crypto
      .subtle
      .digest(
        "SHA-256",
        bytes,
      );

  const hex =
    [...new Uint8Array(digest)]
      .map(
        (byte) =>
          byte
            .toString(16)
            .padStart(2, "0"),
      )
      .join("");

  return `sha256:${hex}`;
}

function subjectMatches(
  context: CoachContextV1,
  rawText: string,
): readonly {
  readonly subjectId: string;
  readonly subjectName: string;
  readonly normalizedName: string;
  readonly index: number;
}[] {
  const message =
    searchableMessage(
      rawText,
    );

  return context.subjects
    .map(
      (subject) => {
        const normalizedName =
          searchableMessage(
            subject.subjectName,
          );

        return {
          subjectId:
            subject.subjectId,
          subjectName:
            subject.subjectName,
          normalizedName,
          index:
            message.indexOf(
              normalizedName,
            ),
        };
      },
    )
    .filter(
      (candidate) =>
        candidate.normalizedName.length
          > 0
        && candidate.index >= 0,
    );
}

function explicitSubjectMatch(
  context: CoachContextV1,
  rawText: string,
):
  | {
      status: "none";
    }
  | {
      status: "ambiguous";
    }
  | {
      status: "resolved";
      subjectId: string;
    } {
  const matches =
    subjectMatches(
      context,
      rawText,
    );

  if (matches.length === 0) {
    return {
      status: "none",
    };
  }

  const unique =
    [...new Map(
      matches.map(
        (item) => [
          item.subjectId,
          item,
        ],
      ),
    ).values()];

  if (unique.length === 1) {
    const onlySubject =
      unique[0];

    if (!onlySubject) {
      return {
        status: "ambiguous",
      };
    }

    return {
      status: "resolved",
      subjectId:
        onlySubject.subjectId,
    };
  }

  const normalized =
    searchableMessage(
      rawText,
    );

  const rawLower =
    rawText
      .normalize("NFC")
      .toLocaleLowerCase("tr-TR");

  const rawCorrectionMarker =
    rawLower.lastIndexOf(
      "de?il",
    );

  const normalizedCorrectionMarker =
    normalized.lastIndexOf(
      "degil",
    );

  if (
    rawCorrectionMarker >= 0
    || normalizedCorrectionMarker >= 0
  ) {
    const correctedPart =
      rawCorrectionMarker >= 0
        ? searchableMessage(
            rawText.slice(
              rawCorrectionMarker
                + "de?il".length,
            ),
          )
        : normalized
            .slice(
              normalizedCorrectionMarker
                + "degil".length,
            )
            .trim();

    const corrected =
      unique.filter(
        (candidate) =>
          correctedPart.includes(
            candidate.normalizedName,
          ),
      );

    if (corrected.length === 1) {
      const correctedSubject =
        corrected[0];

      if (!correctedSubject) {
        return {
          status: "ambiguous",
        };
      }

      return {
        status: "resolved",
        subjectId:
          correctedSubject.subjectId,
      };
    }

    if (corrected.length > 1) {
      return {
        status: "ambiguous",
      };
    }
  }

  return {
    status: "ambiguous",
  };
}

function plannerMention(
  value: string,
): boolean {
  const message =
    searchableMessage(value);

  return (
    message.includes("planner")
    || /\bplan\b/.test(message)
    || message.includes("planim")
    || message.includes("plani")
  );
}

async function subjectReferent(
  context: CoachContextV1,
  subjectId: string,
): Promise<CoachConversationReferentV1> {
  const subject =
    context.subjects.find(
      (candidate) =>
        candidate.subjectId
          === subjectId,
    );

  if (!subject) {
    throw new Error(
      "COACH_CONVERSATION_SUBJECT_NOT_CURRENT",
    );
  }

  return deepFreeze({
    kind: "subject",
    subjectId,
    fingerprint:
      await sha256({
        version:
          COACH_CONVERSATION_CONTEXT_V1_VERSION,
        userId:
          context.userId,
        examProfileId:
          context.examProfileId,
        kind:
          "subject",
        subject,
      }),
  });
}

async function plannerReferent(
  context: CoachContextV1,
): Promise<CoachConversationReferentV1> {
  return deepFreeze({
    kind: "planner",
    fingerprint:
      await sha256({
        version:
          COACH_CONVERSATION_CONTEXT_V1_VERSION,
        userId:
          context.userId,
        examProfileId:
          context.examProfileId,
        kind:
          "planner",
        planner:
          context.planner,
      }),
  });
}

export async function resolveCoachConversationReferentV1(
  input: {
    readonly context:
      CoachContextV1;

    readonly currentMessage:
      string;

    readonly conversation:
      CoachConversationInputV1 | null;
  },
): Promise<CoachConversationResolutionV1> {
  const currentSubject =
    explicitSubjectMatch(
      input.context,
      input.currentMessage,
    );

  if (
    currentSubject.status
      === "ambiguous"
  ) {
    return deepFreeze({
      status:
        "ambiguous",
      referent:
        null,
      provenance:
        "current_message",
    });
  }

  if (
    currentSubject.status
      === "resolved"
  ) {
    return deepFreeze({
      status:
        "resolved",
      referent:
        await subjectReferent(
          input.context,
          currentSubject.subjectId,
        ),
      provenance:
        "current_message",
    });
  }

  if (
    plannerMention(
      input.currentMessage,
    )
  ) {
    return deepFreeze({
      status:
        "resolved",
      referent:
        await plannerReferent(
          input.context,
        ),
      provenance:
        "current_message",
    });
  }

  if (
    !isCoachConversationFollowUpV1(
      input.currentMessage,
    )
    || !input.conversation
  ) {
    return deepFreeze({
      status: "none",
      referent: null,
      provenance: null,
    });
  }

  for (
    let index =
      input.conversation
        .recentTurns.length - 1;
    index >= 0;
    index -= 1
  ) {
    const turn =
      input.conversation
        .recentTurns[index];

    if (!turn) {
      continue;
    }

    if (turn.role !== "user") {
      continue;
    }

    const subject =
      explicitSubjectMatch(
        input.context,
        turn.text,
      );

    if (
      subject.status
        === "ambiguous"
    ) {
      return deepFreeze({
        status:
          "ambiguous",
        referent:
          null,
        provenance:
          `recent_user_turn:${index}`,
      });
    }

    if (
      subject.status
        === "resolved"
    ) {
      return deepFreeze({
        status:
          "resolved",
        referent:
          await subjectReferent(
            input.context,
            subject.subjectId,
          ),
        provenance:
          `recent_user_turn:${index}`,
      });
    }

    if (plannerMention(turn.text)) {
      return deepFreeze({
        status:
          "resolved",
        referent:
          await plannerReferent(
            input.context,
          ),
        provenance:
          `recent_user_turn:${index}`,
      });
    }
  }

  return deepFreeze({
    status: "none",
    referent: null,
    provenance: null,
  });
}

export function buildCoachConversationLanguageContextV1(
  input: {
    readonly currentMessage:
      string;

    readonly conversation:
      CoachConversationInputV1 | null;

    readonly resolution:
      CoachConversationResolutionV1;
  },
): CoachConversationLanguageContextV1 {
  const currentMessage =
    normalizeText(
      input.currentMessage,
      COACH_CONVERSATION_CURRENT_MESSAGE_MAX_LENGTH_V1,
      "COACH_CONVERSATION_CURRENT_MESSAGE_INVALID",
    );

  return deepFreeze({
    version:
      COACH_CONVERSATION_CONTEXT_V1_VERSION,

    authority:
      "non_authoritative_language_context",

    currentMessage,

    recentTurns:
      input.conversation
        ?.recentTurns
      ?? [],

    resolution:
      structuredClone(
        input.resolution,
      ),
  });
}

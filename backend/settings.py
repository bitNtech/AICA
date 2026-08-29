"""Runtime settings for the low-latency audio pipeline.

Defaults are the hyperparameters from README.md, which is the configuration
the live mic pipeline was actually tuned on - do not "improve" them casually.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv

# .env (gitignored) holds HF_TOKEN and any overrides below. Loaded here so it
# applies however the app is started - run.sh, bare uvicorn, or a test import.
load_dotenv()


# Languages IndicConformer accepts as `language_id`.
SUPPORTED_LANGUAGES = frozenset({"ta", "hi", "te", "ml", "kn", "bn", "mr", "gu", "pa"})


@dataclass(frozen=True)
class AudioSettings:
    """Tuned for conversational turn-taking, not long-form batch transcription."""

    # Must stay 16 kHz: both TEN VAD and IndicConformer are trained on it.
    sample_rate: int = 16_000
    vad_hop_size: int = 256  # 16 ms at 16 kHz; TEN VAD is tuned around this.

    # Lower = catches softer/quieter onsets but more false triggers on noise.
    vad_threshold: float = float(os.getenv("VAD_THRESHOLD", "0.35"))

    # 8 x 16 ms = 128 ms kept *before* VAD fires, so VAD onset lag doesn't
    # clip the first syllable.
    pre_roll_frames: int = int(os.getenv("VAD_PRE_ROLL_FRAMES", "8"))

    # 30 x 16 ms = 480 ms - longer than a natural mid-sentence pause, so the
    # ASR gets whole sentences instead of halves.
    endpoint_silence_frames: int = int(os.getenv("VAD_ENDPOINT_SILENCE_FRAMES", "30"))

    # ponytail: not in the reference CLI, which is a trusted local mic. A
    # browser socket is not: without a cap, a stuck speech flag buffers
    # forever. 30 s is far past any real turn, so it never truncates one.
    max_utterance_frames: int = int(os.getenv("ASR_MAX_UTTERANCE_FRAMES", "1875"))

    language: str = os.getenv("ASR_LANGUAGE", "ta")

    # rnnt is slower than ctc but more accurate on this hybrid model -
    # correctness over latency for transcript quality.
    decoding: str = os.getenv("ASR_DECODING", "rnnt")

    # BACKEND_COMPLETION.md Sec3.5: one global asr_lock serializes every
    # concurrent call's ASR work, which won't scale past a handful of calls.
    # This bounds concurrent ASR inference to whatever the GPU can actually
    # hold rather than either (a) one-at-a-time or (b) fully unbounded.
    asr_max_concurrency: int = int(os.getenv("ASR_MAX_CONCURRENCY", "2"))

    def __post_init__(self) -> None:
        if self.language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported ASR_LANGUAGE: {self.language}")
        if self.decoding not in {"ctc", "rnnt"}:
            raise ValueError("ASR_DECODING must be either 'ctc' or 'rnnt'")
        if self.asr_max_concurrency <= 0:
            raise ValueError("ASR_MAX_CONCURRENCY must be positive")


@dataclass(frozen=True)
class LlmSettings:
    """Config for the OpenAI-compatible LLM client (vLLM/TGI) - see BACKEND_COMPLETION.md Sec3.1.

    An OpenAI-compatible client is used rather than a hand-rolled transport so
    the model is swappable (Llama 3.1 8B -> Qwen2.5-7B -> a future model) via
    one base-URL/model-name env var, without touching llm.py or conversation.py.
    """

    base_url: str = os.getenv("LLM_BASE_URL", "http://localhost:8001/v1")
    api_key: str = os.getenv("LLM_API_KEY", "not-needed")
    model: str = os.getenv("LLM_MODEL", "meta-llama/Llama-3.1-8B-Instruct")

    # Low: this is a task-following hospital agent, not a creative one.
    temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))

    # Turns are capped at ~40 words by the master prompt's turn discipline
    # (section 3), so completions don't need much headroom.
    max_tokens: int = int(os.getenv("LLM_MAX_TOKENS", "300"))

    def __post_init__(self) -> None:
        if not self.model:
            raise ValueError("LLM_MODEL must not be empty")
        if not 0.0 <= self.temperature <= 2.0:
            raise ValueError("LLM_TEMPERATURE must be between 0 and 2")
        if self.max_tokens <= 0:
            raise ValueError("LLM_MAX_TOKENS must be positive")


_REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class ConversationSettings:
    """Config for the Conversation Manager: master prompt location and tool-loop bounds."""

    prompt_path: Path = Path(
        os.getenv("CONVERSATION_PROMPT_PATH", str(_REPO_ROOT / "golden" / "main_prompt.txt"))
    )

    # Hard cap on LLM<->tool round-trips per caller turn, so a confused model
    # can't chain tool calls forever instead of answering.
    max_tool_iterations: int = int(os.getenv("LLM_MAX_TOOL_ITERATIONS", "6"))

    # v1 has no caller-metadata source (no CRM lookup, no SIP headers) wired
    # in yet, so this is the only {{agent_name}} substitution main.py can
    # supply at call_started - everything else (mrn, patient_name, ...) stays
    # blank until the LLM fills it in mid-call via lookupPatient et al.
    agent_name: str = os.getenv("CONVERSATION_AGENT_NAME", "Gayathri")

    def __post_init__(self) -> None:
        if self.max_tool_iterations <= 0:
            raise ValueError("LLM_MAX_TOOL_ITERATIONS must be positive")
        if not self.agent_name:
            raise ValueError("CONVERSATION_AGENT_NAME must not be empty")


@dataclass(frozen=True)
class TtsSettings:
    """Config for the svara-TTS adapter - see BACKEND_COMPLETION.md Sec3.2.

    model/voice_reference_path are placeholders: no real svara-TTS package
    reference exists yet, so backend/tts.py's load() raises NotImplementedError
    until one is wired in (see that file). Defined here now so the env-var
    surface doesn't change once it is.
    """

    model: str = os.getenv("TTS_MODEL", "svara-tts")
    voice_reference_path: str = os.getenv("TTS_VOICE_REFERENCE_PATH", "")
    language: str = os.getenv("TTS_LANGUAGE", "ta")

    # BACKEND_COMPLETION.md Sec3.5: same global-lock scaling problem as ASR,
    # for the same reason (GPU-bound synthesis) - bound it instead of
    # serializing every call's TTS work behind one mutex.
    max_concurrency: int = int(os.getenv("TTS_MAX_CONCURRENCY", "2"))

    def __post_init__(self) -> None:
        if self.language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported TTS_LANGUAGE: {self.language}")
        if self.max_concurrency <= 0:
            raise ValueError("TTS_MAX_CONCURRENCY must be positive")


@dataclass(frozen=True)
class SecuritySettings:
    """Access control for the audio WebSocket - BACKEND_COMPLETION.md Sec4.

    No auth existed at all before this: anyone who could reach the port could
    open a session. A shared-secret token is the minimum viable gate for a
    single-tenant v1 deployment; swap for real per-caller auth (SIP trunk
    identity, a signed browser session token, ...) once there is more than one
    trusted caller of this service. Blank token means auth is OFF, matching
    this repo's dev-friendly-by-default env-var pattern (see TTS_VOICE_REFERENCE_PATH)
    - do not deploy to a reachable network with this left blank.
    """

    ws_auth_token: str = os.getenv("AUDIO_WS_AUTH_TOKEN", "")


@dataclass(frozen=True)
class PersistenceSettings:
    """Config for the call-event/history store - BACKEND_COMPLETION.md Sec3.6.

    SQLite (a single file, no server to run) is enough for v1's single-process
    deployment; swap for a real DB once concurrency (Sec3.5) moves this out of
    one process.
    """

    db_path: Path = Path(os.getenv("CALL_EVENTS_DB_PATH", str(_REPO_ROOT / "call_events.db")))

    # Fernet key (base64-encoded, from Fernet.generate_key()) for encrypting
    # event payloads at rest - BACKEND_COMPLETION.md Sec4 flags no
    # encryption-at-rest story for the ledger/call-recording data; this is
    # what makes that story real once a real key is set. Blank means
    # encryption is OFF (plaintext payloads), matching this repo's
    # dev-friendly-by-default env-var pattern (see TTS_VOICE_REFERENCE_PATH /
    # AUDIO_WS_AUTH_TOKEN) - do not deploy to a reachable network with this
    # left blank once real patient PII/PHI is flowing through the store.
    encryption_key: str = os.getenv("CALL_EVENTS_ENCRYPTION_KEY", "")

/* Browser-side 16 kHz PCM stream for the AICA VAD + ASR WebSocket pipeline. */
(() => {
  const TARGET_SAMPLE_RATE = 16_000;
  let captureSource;
  let captureProcessor;
  let captureSocket;

  // Minimal agent-audio playback: queue each incoming PCM16 clause frame
  // back-to-back on its own AudioContext so clauses play in order with no
  // gaps/overlaps, without buffering the whole reply before starting.
  let playbackContext;
  let playbackSampleRate = TARGET_SAMPLE_RATE;
  let nextPlayTime = 0;
  let agentTextStarted = false;

  function ensurePlaybackContext() {
    if (!playbackContext) playbackContext = new (window.AudioContext || window.webkitAudioContext)();
    return playbackContext;
  }

  function playAgentAudioFrame(buffer) {
    const pcm16 = new Int16Array(buffer);
    if (pcm16.length === 0) return;
    const context = ensurePlaybackContext();
    const audioBuffer = context.createBuffer(1, pcm16.length, playbackSampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < pcm16.length; index += 1) channel[index] = pcm16[index] / 32768;
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, nextPlayTime);
    source.start(startAt);
    nextPlayTime = startAt + audioBuffer.duration;
  }

  function appendAgentClause(text) {
    agent.hidden = false;
    empty.hidden = true;
    if (!agentTextStarted) {
      agent.replaceChildren();
      const name = document.createElement("strong");
      name.textContent = "AICA";
      agent.append(name);
      agentTextStarted = true;
    }
    agent.append(document.createTextNode(" " + text));
  }

  const language = () => new URLSearchParams(location.search).get("lang") || "ta";
  const websocketUrl = () => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const host = location.hostname || "localhost";
    const port = new URLSearchParams(location.search).get("apiPort") || "8000";
    return `${protocol}://${host}:${port}/ws/audio`;
  };

  function resampleToPcm16(input, sourceRate) {
    const output = new Int16Array(Math.round(input.length * TARGET_SAMPLE_RATE / sourceRate));
    for (let index = 0; index < output.length; index += 1) {
      const position = index * sourceRate / TARGET_SAMPLE_RATE;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const sample = input[left] + (input[right] - input[left]) * (position - left);
      output[index] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
    }
    return output;
  }

  function setTranscript(text) {
    client.hidden = false;
    empty.hidden = true;
    client.replaceChildren();
    const name = document.createElement("strong");
    name.textContent = "Jordan";
    client.append(name, document.createTextNode(text));
  }

  function handlePipelineEvent(event) {
    console.info("[AICA] Audio pipeline:", event);
    switch (event.type) {
      case "ready":
        if (!event.asr_ready) micNote.textContent = "VAD is ready; ASR model needs Hugging Face access.";
        else if (!event.tts_ready) micNote.textContent = "ASR ready; TTS model needs to be configured (see backend/tts.py).";
        break;
      case "vad_start":
        micNote.textContent = "Customer is speaking…";
        break;
      case "vad_end":
        micNote.textContent = "Speech ended — preparing transcription…";
        break;
      case "asr_start":
        micNote.textContent = "Generating transcript…";
        break;
      case "transcript":
        setTranscript(event.text || "No speech recognized.");
        micNote.textContent = `Transcript ready (${event.language}).`;
        break;
      case "agent_speaking_start":
        playbackSampleRate = event.sample_rate || TARGET_SAMPLE_RATE;
        nextPlayTime = 0;
        agentTextStarted = false;
        micNote.textContent = "AICA is speaking…";
        break;
      case "agent_clause":
        appendAgentClause(event.text);
        break;
      case "agent_speaking_end":
        micNote.textContent = "Your turn to speak.";
        break;
      case "agent_error":
      case "asr_error":
      case "pipeline_error":
      case "protocol_error":
        console.error("[AICA] Audio pipeline error:", event.message);
        micNote.textContent = event.message;
        break;
    }
  }

  async function configureMicrophone() {
    setupStatus.textContent = "Requesting microphone permission…";
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      captureSource = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      data = new Uint8Array(analyser.fftSize);
      captureSource.connect(analyser);
      setup.hidden = true;
      app.classList.remove("blurred");
      availability.classList.add("ready");
      availability.querySelector("span").textContent = "Microphone ready";
      settings.textContent = "16 kHz PCM ready";
    } catch (error) {
      setupStatus.textContent = error.name === "NotAllowedError"
        ? "Permission was not granted. Please allow the microphone to continue."
        : "Unable to access the microphone. Please try again.";
    }
  }

  function startPcmCapture() {
    if (!stream || !audioContext || !captureSource || !audioContext.createScriptProcessor) {
      micNote.textContent = "This browser does not support low-latency PCM capture.";
      return;
    }
    const url = websocketUrl();
    console.info("[AICA] Connecting PCM WebSocket:", url);
    captureSocket = new WebSocket(url);
    captureSocket.binaryType = "arraybuffer";
    captureSocket.onopen = async () => {
      await audioContext.resume();
      captureSocket.send(JSON.stringify({
        type: "call_started", caller: "Jordan Miller", audio_format: "pcm_s16le",
        sample_rate: TARGET_SAMPLE_RATE, channels: 1, language: language(), decoding: "rnnt",
      }));
      captureProcessor = audioContext.createScriptProcessor(1024, 1, 1);
      captureProcessor.onaudioprocess = ({ inputBuffer, outputBuffer }) => {
        outputBuffer.getChannelData(0).fill(0);
        if (muted || captureSocket?.readyState !== WebSocket.OPEN) return;
        const pcm = resampleToPcm16(inputBuffer.getChannelData(0), audioContext.sampleRate);
        captureSocket.send(pcm.buffer);
      };
      captureSource.connect(captureProcessor);
      captureProcessor.connect(audioContext.destination);
      micNote.textContent = "16 kHz microphone audio is streaming to AICA.";
    };
    captureSocket.onmessage = ({ data: message }) => {
      if (message instanceof ArrayBuffer) {
        playAgentAudioFrame(message);
        return;
      }
      try { handlePipelineEvent(JSON.parse(message)); }
      catch { console.warn("[AICA] Unexpected pipeline message:", message); }
    };
    captureSocket.onerror = () => {
      console.error("[AICA] PCM WebSocket connection failed.");
      micNote.textContent = "Call is running, but the audio processing server is unavailable.";
    };
    captureSocket.onclose = ({ code, reason }) => console.info("[AICA] PCM WebSocket closed:", code, reason || "no reason");
  }

  function stopPcmCapture() {
    if (captureProcessor) {
      captureProcessor.onaudioprocess = null;
      try { captureSource?.disconnect(captureProcessor); } catch { /* already disconnected */ }
      captureProcessor.disconnect();
      captureProcessor = undefined;
    }
    if (captureSocket?.readyState === WebSocket.OPEN) captureSocket.send(JSON.stringify({ type: "call_ended" }));
    captureSocket?.close();
    captureSocket = undefined;
  }

  function answerWithAica() {
    active = true;
    answer.hidden = true;
    decline.hidden = true;
    end.hidden = false;
    mute.disabled = false;
    pause.disabled = false;
    label.textContent = "Call in progress";
    state.className = "calling";
    state.innerHTML = "<i></i><span>Connected with Jordan</span>";
    agentStatus.textContent = "Speaking for you";
    speaking.innerHTML = "<i></i><span>AICA is speaking on your behalf</span>";
    empty.hidden = true;
    client.hidden = false;
    agent.hidden = false;
    footer.textContent = "AICA is handling this call";
    startedAt = Date.now();
    time();
    tick = setInterval(time, 1000);
    drawWave();
    startPcmCapture();
  }

  function finishPcmCall(message = "Call ended") {
    active = false;
    clearInterval(tick);
    cancelAnimationFrame(animation);
    stopPcmCapture();
    label.textContent = message;
    state.className = "calling";
    state.innerHTML = "<span>Conversation saved</span>";
    agentStatus.textContent = "Ready for the next call";
    speaking.innerHTML = "<span>Call complete</span>";
    end.hidden = true;
    mute.disabled = true;
    pause.disabled = true;
    footer.textContent = "Call complete";
    idleWave();
  }

  function resetPcmCall() {
    finishPcmCall("Incoming call");
    timer.textContent = "00:00";
    answer.hidden = false;
    decline.hidden = false;
    empty.hidden = false;
    client.hidden = true;
    agent.hidden = true;
    state.className = "calling ringing";
    state.innerHTML = "<i></i><span>Calling your business</span>";
    agentStatus.textContent = "Will answer on your behalf";
    speaking.innerHTML = "<i></i><span>Waiting for the call to connect</span>";
    footer.textContent = "Awaiting call";
    muted = false;
    agentPaused = false;
    mute.textContent = "Mute my microphone";
    pause.textContent = "Pause AICA";
    micNote.textContent = "Your microphone is enabled and ready for the next call.";
  }

  // The initial UI binds legacy handlers. Capture-phase handlers replace them
  // without changing the page's visual controls.
  setupMic.addEventListener("click", event => { event.preventDefault(); event.stopImmediatePropagation(); configureMicrophone(); }, true);
  answer.addEventListener("click", event => { event.preventDefault(); event.stopImmediatePropagation(); answerWithAica(); }, true);
  decline.addEventListener("click", event => { event.preventDefault(); event.stopImmediatePropagation(); finishPcmCall("Call declined"); }, true);
  end.addEventListener("click", event => { event.preventDefault(); event.stopImmediatePropagation(); finishPcmCall(); }, true);
  reset.addEventListener("click", event => { event.preventDefault(); event.stopImmediatePropagation(); resetPcmCall(); }, true);

  // Keep programmatic callers on the PCM pipeline as well.
  window.startAudioCapture = startPcmCapture;
  window.stopAudioCapture = stopPcmCapture;
  window.enableMic = configureMicrophone;
})();

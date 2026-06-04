export function stripPrivateSpeechAudioFromActions(actions: unknown): unknown {
  if (!Array.isArray(actions)) return actions;
  return actions.map((action) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return action;
    const record = action as Record<string, unknown>;
    if (record.type !== 'speech') return action;
    const {
      audioUrl: _audioUrl,
      audioId: _audioId,
      visemes: _visemes,
      mouthCues: _mouthCues,
      ...rest
    } = record;
    return rest;
  });
}

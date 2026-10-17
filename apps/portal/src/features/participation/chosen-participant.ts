const keyOf = (userId: string) => `ssm-usor.portal.participant.${userId}`;

// Storage can be unavailable (a private window, blocked site data); the portal then asks again.
export function readChosenParticipant(userId: string) {
  try {
    return localStorage.getItem(keyOf(userId));
  } catch {
    return null;
  }
}

export function rememberChosenParticipant(userId: string, participantId: string) {
  try {
    localStorage.setItem(keyOf(userId), participantId);
  } catch {
    return;
  }
}

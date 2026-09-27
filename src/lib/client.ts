/** Browser-side helpers that talk to the lesson API. */
export async function uploadAudio(
  lessonId: string,
  kind: "lesson" | "debrief",
  blob: Blob,
): Promise<void> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("audio", blob, `${kind}.webm`);

  const res = await fetch(`/api/lessons/${lessonId}/audio`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Could not upload the recording.");
}

// Autocomplétion d'événements pour les options de type entier.
// `fetcher` renvoie la liste d'événements à proposer (déjà filtrée si besoin).
export async function autocompleteEvents(interaction, fetcher) {
  try {
    const focused = String(interaction.options.getFocused() || '').toLowerCase();
    const events = await fetcher();

    const choices = events
      .filter((e) => {
        if (!focused) return true;
        return (
          String(e.id) === focused ||
          String(e.name).toLowerCase().includes(focused)
        );
      })
      .slice(0, 25)
      .map((e) => ({
        name: `#${e.id} — ${e.name}`.slice(0, 100),
        value: Number(e.id)
      }));

    await interaction.respond(choices);
  } catch {
    // En cas d'erreur API, on renvoie une liste vide plutôt que de planter.
    try {
      await interaction.respond([]);
    } catch {
      /* l'interaction a peut-être expiré */
    }
  }
}

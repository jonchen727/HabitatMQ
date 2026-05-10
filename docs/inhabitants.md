# Inhabitants

The Inhabitants page manages the animals (or fish) living in your enclosure. Each inhabitant has a profile with species information, weight history, growth percentile, and quick-access stats.

<img src="../public/screenshots/inhabitants.png" width="320" alt="Inhabitants screenshot"/>

---

## Inhabitant Cards

Each animal appears as a card showing:

| Field | Description |
|-------|-------------|
| **Name** | Animal's name |
| **Sex** | ♀ / ♂ / Unknown badge |
| **Species** | Scientific name in italics |
| **Morph / Variant** | E.g. "Arctic Cinnamon pos het. Sunburst Coral" |
| **Date added** | When the animal was added to the system |
| **Edit / Archive / Delete** | Action buttons on the right |

---

## Profile Types

When adding an inhabitant, select the type that matches your setup. The type controls which care event categories are available on the Care Log page.

| Type | Care events available |
|------|----------------------|
| **Reptile** | Feeding, Handling, Weight, Shedding, Cleaning, Vet visit |
| **Aquarium** | Feeding, Water change, Water test, Dosing, Equipment check |

---

## Adding an Inhabitant

Tap **+ Add** in the top-right to open the profile form:

| Field | Notes |
|-------|-------|
| **Name** | Display name used throughout the app |
| **Type** | Reptile or Aquarium |
| **Species** | Scientific name (e.g. *Heterodon nasicus*) |
| **Morph** | Morph or variant description |
| **Sex** | Female / Male / Unknown |
| **Date of birth** | Optional — used for age calculation |
| **Date acquired** | When you got the animal |
| **Source** | Breeder, rescue, shop, etc. |

---

## Weight Tracking

Weight entries logged on the Care Log page appear in the inhabitant's weight history. The header on the Care Log page shows:

- **Current weight** — most recent weight entry (e.g. `52g`)
- **Growth percentile** — where the animal falls vs. published growth curves for the species (e.g. `50th–75th`)

Weight percentile ranges are pre-loaded for Western Hognose Snake growth data. To add curves for other species, see the [`/src/lib/growth-data`](/src/lib/) directory.

---

## Multiple Enclosure Support

All pages — Dashboard, Care Log, History, Controls — filter to the currently selected animal via the **animal picker pill** in the header. You can have as many inhabitants as you like; the picker gives you a dropdown of all animals in the system.

This makes HabitatMQ suitable for keepers with multiple enclosures. Each enclosure's sensors and controls can be wired to different MQTT topics and mapped in Config.

---

## Archiving vs. Deleting

- **Archive** — hides the animal from the picker but preserves all history (feeding logs, weights, photos). Use for animals that have been rehomed or passed.
- **Delete** — permanently removes the animal and all associated care records. This is irreversible.

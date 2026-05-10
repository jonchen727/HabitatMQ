# Care Log

The Care Log tracks everything that happens with your animal over time — feedings, sheds, handling sessions, weight checks, vet visits, and more. Events are shown on a calendar with color-coded dots, and you can filter by event type.

<img src="../public/screenshots/care.png" width="320" alt="Care Log screenshot"/>

---

## Calendar

The monthly calendar shows a dot indicator on each day that has logged events. Multiple dots appear side by side when multiple event types occurred on the same day.

| Dot color | Event type |
|-----------|-----------|
| 🟡 Yellow | Feeding |
| 🔵 Blue | Handling |
| 🟢 Teal | Weight check |
| 🟣 Purple | Shedding |
| ⚪ Gray | Other / Cleaning / Vet |

**Navigation:**
- `<` / `>` arrows to step month by month
- Today's date is circled
- Tap any date to jump to its event list

---

## Event Type Filters

Below the calendar, a scrollable chip row lets you filter the event list:

| Filter | Shows |
|--------|-------|
| **All** | Every event type |
| **Feeding** | Food offerings and refusals |
| **Handling** | Handling sessions |
| **Weight** | Weight measurements |
| **Shedding** | Shed start, in-shed, complete |

---

## Event List

Tap a date on the calendar to see all events logged that day. Each event card shows:

- Event type icon and name
- Timestamp
- Notes (if any)
- Photos attached (thumbnail grid, tap to open lightbox)

When no events exist for a date, a `+ Log something` prompt appears.

---

## Logging an Event

Tap **+ Log** in the top right (or `+ Log something` in an empty day) to open the event editor sheet.

### Feeding Event

| Field | Description |
|-------|-------------|
| **Date / time** | Defaults to now, editable |
| **Prey type** | F/T mouse, rat, chick, etc. |
| **Prey size** | Pinky, fuzzy, hopper, adult, etc. |
| **Prey count** | Number of items offered |
| **Accepted** | Yes / No / Partial toggle |
| **Notes** | Free text (strike distance, hunting behavior, etc.) |
| **Photos** | Attach from camera roll |

### Weight Event

| Field | Description |
|-------|-------------|
| **Date / time** | Defaults to now |
| **Weight** | Grams or ounces (set unit in Config) |
| **Notes** | Optional context |

Weight entries feed the **growth percentile** displayed on the Inhabitants page.

### Shedding Event

| Field | Description |
|-------|-------------|
| **Date / time** | When the shed was observed |
| **Stage** | Pre-shed / In shed / Complete |
| **Condition** | Perfect / Partial / Stuck |
| **Notes** | Optional context |

### Handling Event

| Field | Description |
|-------|-------------|
| **Date / time** | Session start |
| **Duration** | Minutes |
| **Notes** | Behavior notes, response to handling |

---

## Animal Picker

The animal pill in the header switches the calendar and event list to a different inhabitant. Each animal maintains a fully separate care history.

---

## Editing and Deleting Events

Swipe left on any event card to reveal **Edit** and **Delete** actions. Editing reopens the same event form pre-populated with existing values.

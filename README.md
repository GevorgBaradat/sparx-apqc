# Sparx EA → Interactive SVG: APQC Process Model

**Serious business process modelling without an enterprise budget.**

A complete, navigable process architecture built in Sparx Enterprise Architect and exported as a standalone interactive SVG system — no web server, no licences for viewers, no SAP Signavio subscription required.

---

## Live demo

[Open live demo →](https://gevorgbaradat.github.io/sparx-apqc)

What you can do:

- **Navigate the process hierarchy** — click the 🔗 link icon on any element to drill down to its child diagram. Use the browser Back button to return.
- **Read descriptions** — hover over any element to see its description from the model (tooltip)
- **Leave comments** — click any element to open an annotation window. Add your question or remark and save. An orange triangle marks annotated elements.
- **Save your annotated version** — the "Save with notes..." button writes a new SVG file with all your annotations embedded.
- **Use Fisheye view** — enable the lens in the control panel for focus+context exploration of dense diagrams

---

## What this is

This repository contains:

1. **A complete APQC Process Classification Framework model** built in Sparx EA — all levels L1 through L4, fully diagrammed with drill-down navigation
2. **An interactive SVG export system** — every diagram in the tree exported as a self-contained SVG file, linked to its children and parents
3. **The export script** (`ea_diagram_to_svg_v38.js`) — the JScript that drives the export, available as a standalone file you can drop into any Sparx EA project

The SVG output runs directly in any modern browser from a folder on disk. No installation. No server. No additional software.

---

## The problem this solves

Sparx EA already has two native export options:

|                             | Native HTML export | Native SVG export     | This script          |
| --------------------------- | ------------------ | --------------------- | -------------------- |
| Navigation between diagrams | Limited            | None - isolated files | Full drill-down tree |
| Tooltips from model Notes   | No                 | No                    | Yes                  |
| Annotation and feedback     | No                 | No                    | Yes - save to file   |
| Design quality              | Poor               | Basic                 | Configurable         |
| Fisheye lens                | No                 | No                    | Yes                  |
| Works without web server    | Partially          | Yes                   | Yes                  |
| No viewer licence needed    | Yes                | Yes                   | Yes                  |

You already own Sparx EA. This script closes the gap between what Sparx exports natively and what your stakeholders actually need: a navigable, annotatable, self-contained model they can explore in a browser and send feedback from.

Build once in Sparx. Publish the SVG tree. Anyone in your organisation can read it, leave questions on specific elements, and return the annotated file — without any additional software or licences.

**A note on APQC and SAP Signavio:** SAP Signavio - one of the most heavily funded process platforms on the market - has built native APQC PCF import into their product. That is confirmation that starting from the APQC framework is the right approach, not an academic exercise. The difference: Signavio's APQC import comes with known limitations in how the hierarchy maps to their notation model, and it is bundled with an enterprise subscription. This repository gives you the same starting point, in a tool you already own, with full control over the model structure.

---

## Repository contents

```
/
├── index.html                    # Entry point — opens the top-level APQC diagram
├── README.md                     # This file
├── apqc/                         # SVG export — 1681 diagrams, full APQC L1–L4 tree
├── scripts/
│   ├── ea_diagram_to_svg_v38.js  # Main export script (JScript for Sparx EA)
│   ├── ea_fisheye_viewer.js      # Fisheye viewer: lens follows mouse
│   ├── ea_fisheye_center.js      # Fisheye viewer: fixed lens, pan diagram
│   ├── EA_add_composite_to_parent.js  # Utility: build Composite links from ParentID
│   └── EA_show_hidden_connectors.js   # Utility: restore hidden connectors on diagram
├── sparx-project/
│   └── APQC_721_GiyHub.qea        # Sparx EA project file (requires Sparx EA to edit)
└── docs/
    └── EA_scripts_documentation_GH.md   # Full technical documentation
```

---

## Using the SVG system (no Sparx required)

1. Download or clone this repository
2. Open `index.html` in Chrome, Edge, or Firefox
3. Navigate the APQC model

That is all. No installation. No server.

**Browser support:** Chrome and Edge recommended (File System Access API for saving annotations). Firefox works with standard download fallback.

---

## Using the export script (requires Sparx EA)

The script reads directly from the Sparx EA SQLite database — it works with `.qea` and `.xea` model files.

**To export your own model:**

1. Open your Sparx EA project
2. Open the diagram you want as the root of the export
3. Copy `ea_diagram_to_svg_v38.js` into your Sparx Scripts folder, or paste it in `Specialize → Scripting → New Script`
4. Run: `Specialize → Scripting → Run`
5. All diagrams in the tree under the current diagram are exported to the same folder as the model file

The script exports the full tree recursively — every child diagram, to any depth. Each diagram becomes one SVG file. Navigation links between diagrams use relative paths, so the entire tree works from any folder without a web server.

**Tested with:** Sparx EA 15.x and 16.x (`.qea` SQLite format)
Sparx Enterprise Architect is available from [sparxsystems.eu](https://sparxsystems.eu)
---

## Interactive SVG features

### Tooltip
Hover over any element that has a Notes field in EA. The tooltip displays the element description and follows the cursor.

### Annotation window
Click any element to open the annotation window. The element's Notes text is shown as context at the top. Type your question or remark below the separator line and click Save. The annotation is embedded in the SVG file itself.

### Saving annotations
The "Save with notes..." button writes the current SVG — with all annotations — to a new file. Send this file back to the model author as feedback.

### Drill-down navigation
Elements with child diagrams show a 🔗 icon. Click to navigate to the child diagram. Use the browser Back/Forward buttons to move through the hierarchy.

### Fisheye lens
Enable in the control panel. Adjust lens strength (D) and radius (R). Elements near the cursor enlarge; distant elements compress but remain visible. Useful for dense diagrams.

### Control panel
Draggable, resizable. Three independent scale controls: diagram zoom, tooltip size, annotation window size.

---

## What can be ordered

This repository is both a working product and a demonstration of capability.

**One-time modelling services:**
- Custom APQC model adapted to your industry vertical or company-specific process landscape
- Translation of model element descriptions to German, Spanish, Polish, or other languages
- APQC import and initial configuration for your Sparx EA installation

**Full implementation:**
- Sparx EA modelling technology deployment in a BA department or company-wide
- Covers: domain model (business objects and actors), process architecture L1–L4, SIPOC models, enterprise architecture (ArchiMate), data structures
- Training and knowledge transfer included

Contact: [ychernyavskiyuml@gmail.com](mailto:ychernyavskiyuml@gmail.com) | [LinkedIn](https://www.linkedin.com/in/yuriy-chernyavskiy-b04906168)

---

## The book

A practical guide to serious business modelling without enterprise budget is in progress on Leanpub.

*Serious Business Modelling Without Enterprise Budget: A Practical Guide to Sparx EA for SMB*

[Follow on Leanpub →](https://leanpub.com/) *(link will be added when available)*

---

## Technical notes

The export script handles three connector geometry types automatically:

| Type         | Recognition            | Algorithm                                            |
| ------------ | ---------------------- | ---------------------------------------------------- |
| Direct       | No Path, no TREE style | Liang-Barsky line clipping to element bounding boxes |
| Ortho-Square | Has Path data, TREE=OS | Waypoints from Path + edge attachment by EDGE+SX/SY  |
| Tree         | TREE=V/H/LV/LH         | 4-point route via horizontal/vertical hub            |

Coordinate system: Sparx EA uses Y-down with negative values. The script inverts Y for SVG: `svgY = eaMaxY - eaY + PAD`.

Drill-down: two mechanisms supported — Activity/BPMN (`NType=8 + PDATA1`) and Class (`t_diagram.ParentID = element.Object_ID`). Cycle protection via `VISITED[diagID]` map.

Full technical documentation: [docs/EA_scripts_documentation_GH.md](docs/EA_scripts_documentation_GH.md)

---

## License

Scripts and documentation: MIT License.
APQC PCF content: based on the APQC Process Classification Framework®, used for demonstration purposes. [apqc.org](https://www.apqc.org/)

---

Built on [Sparx Enterprise Architect](https://sparxsystems.eu) — the modelling platform that makes this possible.

*Yurii Cherniavsky · Enterprise Architect · July 2026*

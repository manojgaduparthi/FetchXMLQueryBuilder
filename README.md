# FetchXML Query Builder

A Power Apps Component Framework (PCF) control that lets you visually build, preview, and save FetchXML queries directly inside Dynamics 365 / Dataverse model-driven app forms. Add it to any multiline text field — users select an entity, define filter conditions with nested AND/OR groups, join related entities via link-entity, pick columns, set sort order, and see the generated FetchXML in real time. The query is automatically saved to the bound field and fully restored on form reload, giving power users and admins an Advanced Find-style experience without writing XML by hand.

**Version**: 1.0.0 | **License**: MIT | **Framework**: PCF + React 17 + Fluent UI v8

---

## Features

### Query Building
- **Visual condition builder** — select attributes, operators, and values from dropdowns
- **All FetchXML operators** — comparison, text pattern matching (Contains, Begins With, Ends With), date operators (relative and parameterized), null checks, user context operators
- **Nested AND/OR groups** — combine conditions with arbitrary nesting depth; select 2+ conditions and click "Group Selected" to create sub-groups
- **Duplicate conditions** — one-click duplicate of any condition row for rapid query construction
- **Related entity joins** — add `<link-entity>` joins through a searchable relationship dropdown; supports OneToMany, ManyToOne, and ManyToMany with filter conditions per related entity
- **Column selection** — choose specific attributes via a searchable panel, or retrieve all by default
- **Sort order** — configure up to 2 ascending/descending sort clauses via a dedicated Sort panel

### User Experience
- **Searchable entity selector** — type-ahead ComboBox filtering across all entities; dropdown opens automatically as you type
- **Searchable related entity picker** — contains-based type-ahead search across hundreds of relationships with OOB Advanced Find-style labels
- **Searchable attribute fields** — ComboBox with autocomplete for fast attribute selection in condition rows
- **Native lookup picker** — uses the built-in Dynamics 365 lookup dialog for record selection with multi-select support
- **Sort panel** — Panel-based UI (like Edit Columns) with Apply/Cancel pattern and max 2 sort clauses
- **Universal entity selector** — works across any entity in your environment without pre-configuration
- **Real-time FetchXML preview** — toggle FetchXML view to see, copy, and verify the generated XML
- **Save & restore** — persists queries to a bound Dataverse text field; fully restores conditions, groups, related entities, columns, and sort order on form reload
- **Reset query** — one-click reset clears all conditions, sorts, columns, and related entities

### Technical Quality
- **Error boundary** — graceful error handling prevents white-screen crashes with a "Reset Control" button
- **Accessible** — ARIA labels on all interactive controls
- **Performance optimized** — `React.memo` on heavy components (ConditionRow, QueryGroupComponent, RelatedEntitySelector), `useMemo`/`useCallback` for derived values, parallel metadata loading with multi-level caching
- **Centralized architecture** — all colors, sizes, timing, and API constants extracted to a single `constants.ts` file; centralized URL resolution in MetadataService
- **Type-safe** — full TypeScript with strict typing across all 13 source files
- **Zero external dependencies** — only React 17, Fluent UI v8, and the PCF framework


---

## Quick Start

### Prerequisites
- Dynamics 365 / Power Apps environment
- System Customizer or Administrator security role
- For development: Node.js 18+, npm, [Power Apps CLI](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/get-powerapps-cli)

### Install from Solution
1. Download the managed or unmanaged solution `.zip` from the `releases/` folder (or the Releases page)
2. In your environment, go to **Settings → Solutions → Import**
3. Select the `.zip` file and click **Publish All Customizations**

### Build Solutions from Source
```powershell
git clone <repository-url>
cd FetchXMLQueryBuilder
npm install
npm run build

# Pack unmanaged solution
pac solution pack --zipfile releases/FetchXMLQueryBuilder_unmanaged.zip --folder solution --packagetype Unmanaged

# Pack managed solution
pac solution pack --zipfile releases/FetchXMLQueryBuilder_managed.zip --folder solution --packagetype Managed
```

### Deploy to Your Environment
```powershell
# Authenticate to your environment
pac auth create --url https://your-org.crm.dynamics.com

# Push the control
pac pcf push --publisher-prefix yourprefix
```

---

## Configuration

### Step 1 — Create a Storage Field
Add a **Multiple Lines of Text** field (or a Multi-line text column) to the entity/table where you want to store the FetchXML output.

### Step 2 — Add the Control to a Form
1. Open the form in the form editor
2. Select your text field → **Change Control** (classic) or **+ Component** (modern)
3. Search for **FetchXML Query Builder** and add it
4. Bind the `fetchXML` property to your text field

### Step 3 — Configure Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `fetchXML` | Multiple Lines of Text | **Yes** | Bound field that stores the generated FetchXML query |
| `targetEntity` | Single Line of Text | No | Optional default entity to pre-select (e.g., `account`, `contact`). If left blank, the user picks an entity from the dropdown. Case-insensitive. |

---

## Usage

1. **Select an entity** — use the searchable dropdown at the top to choose the entity to query (pre-selected if `targetEntity` is configured)
2. **Add conditions** — click **Add Condition**, then pick an attribute, operator, and value
3. **Duplicate conditions** — click the copy icon on any condition row to duplicate it
4. **Group conditions** — check 2+ conditions and click **Group Selected** to create nested AND/OR logic
5. **Add related entities** — in the Related Entities section, click **Add Related Entity** and search for the relationship
6. **Filter related entities** — expand filter conditions on any related entity to add WHERE clauses on the join
7. **Select columns** — click **Columns** to open the panel and choose attributes (with search)
8. **Define sort order** — click **Sort** to open the panel and add up to 2 ascending/descending clauses
9. **Preview** — click **FetchXML** to toggle the generated XML view (with Copy button)
10. **Save** — click **Save** to persist the query to the bound field
11. **Reset** — click **Reset** to clear everything and start over

---

## Architecture

```
FetchXMLQueryBuilder/
├── index.ts                          # PCF control lifecycle (init, updateView, getOutputs, destroy)
├── types.ts                          # TypeScript interfaces and enums
├── constants.ts                      # Centralized colors, sizes, timing, API config
├── components/
│   ├── FetchXMLQueryBuilder.tsx      # Main orchestrator component (~1000 lines)
│   ├── QueryGroupComponent.tsx       # Recursive AND/OR group with conditions
│   ├── ConditionRow.tsx              # Single condition (attribute + operator + value)
│   ├── RelatedEntitySelector.tsx     # Link-entity relationship picker with filters
│   ├── LookupPicker.tsx              # Native D365 lookup dialog wrapper
│   └── ErrorBoundary.tsx             # React error boundary for graceful failures
├── services/
│   ├── metadataService.ts            # Entity, attribute, relationship metadata (Web API)
│   └── lookupService.ts              # Record search and retrieval for lookup fields
├── utils/
│   ├── fetchXmlGenerator.ts          # QueryGroup → FetchXML string
│   └── fetchXmlParser.ts             # FetchXML string → QueryGroup (for restore)
solution/                                 # Pre-built solution for import
├── Controls/
│   └── mg_Dynamics365.FetchXMLQueryBuilder/
│       ├── bundle.js
│       └── ControlManifest.xml
└── Other/
    ├── Customizations.xml
    ├── Relationships.xml
    └── Solution.xml
releases/                                 # Packed solution ZIPs
├── FetchXMLQueryBuilder_1.0.0_managed.zip
└── FetchXMLQueryBuilder_1.0.0_unmanaged.zip
```

### Key Design Decisions
- **IsValidForAdvancedFind** filtering on relationships in the data layer — aligns with Modern Advanced Find and avoids undocumented Classic AF rules
- **Fluent UI ComboBox** with `allowFreeform` + `autoComplete="off"` + `onInputValueChange` for contains-based type-ahead search
- **Parallel metadata loading** with per-entity caching (entity metadata, relationships, attribute display names, entity names) to minimize API calls
- **Panel UI pattern** for Sort and Columns — Apply/Cancel workflow prevents accidental changes
- **Centralized `getClientUrl()`** in MetadataService with `window.location` fallback for compatibility
- **Error Boundary** wraps the entire control so a rendering error in any subcomponent produces a "Reset Control" button instead of a blank space

---

## Supported Operators

| Category | Operators |
|----------|-----------|
| **Comparison** | Equals, Does Not Equal, Greater Than, Greater Than or Equal, Less Than, Less Than or Equal |
| **Text** | Contains, Does Not Contain, Begins With, Does Not Begin With, Ends With, Does Not End With |
| **Null** | Contains Data (not-null), Does Not Contain Data (null) |
| **Date (relative)** | Yesterday, Today, Tomorrow, Last/This/Next Week, Last/This/Next Month, Last/This/Next Year, Last 7 Days, Next 7 Days |
| **Date (parameterized)** | Last/Next X Hours/Days/Weeks/Months/Years, Older Than X Minutes/Hours/Days/Weeks/Months/Years |
| **Date (specific)** | On, On or Before, On or After |
| **Range** | Between, Not Between, In, Not In |
| **User context** | Equals Current User, Does Not Equal Current User, Equals Current User's Teams, Equals Current User or User's Teams, Equals Current User or Their Reporting Hierarchy, Equals Current User and Their Teams or Their Reporting Hierarchy and Their Teams |

---

## Development

### Commands
```powershell
npm install          # Install dependencies
npm run build        # Production build
npm run start:watch  # Dev server with hot reload
npm run lint         # ESLint check
npx tsc --noEmit     # TypeScript type-check only
```

### Tech Stack
- **PCF Framework** v1.3+
- **React** 17 with TypeScript 5.8
- **Fluent UI** v8 (Microsoft's design system)
- **Dynamics 365 Web API** v9.2 for metadata retrieval

### Testing
After deploying, open the form containing the control and verify:
1. Entity dropdown loads and is searchable (type to filter, dropdown auto-opens)
2. Conditions can be added, duplicated, modified, and grouped
3. Related entities load and are searchable with OOB-style labels
4. Sort panel allows up to 2 sort clauses with Apply/Cancel
5. Column picker panel supports search, Select All, Clear All
6. FetchXML preview generates valid XML
7. Save and reload preserves the full query state (conditions, groups, related entities, columns, sort)
8. Reset clears all state

---

## Changelog

### v1.0.0
- Initial release
- Visual query builder with entity selection, condition groups (nested AND/OR), related entities (link-entity joins)
- All FetchXML operators: comparison, text pattern, date (relative + parameterized), null checks, user context
- Column picker panel with search, Select All, Clear All
- Sort order panel (Apply/Cancel, max 2 clauses)
- Save/restore to bound Dataverse text field with full round-trip fidelity
- Real-time FetchXML preview with copy support
- Responsive single-row toolbar layout
- Performance: `useMemo`/`useCallback` optimizations, `React.memo` on key components, centralized metadata caching
- Case-insensitive entity name handling — `targetEntity` accepts `Account`, `account`, or `ACCOUNT`
- Error boundary for graceful error handling

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and verify the build (`npm run build`)
4. Submit a pull request

---

## License

MIT © Manoj Gaduparthi

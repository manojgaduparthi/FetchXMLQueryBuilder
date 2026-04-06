# Changelog

---

## v1.0.0 — April 5, 2026
- **Initial release** for PCF Gallery
- Visual FetchXML query builder with entity selection, nested AND/OR condition groups, related entity joins (link-entity)
- All FetchXML operators: comparison, text pattern (Contains, Begins With, Ends With), date (relative + parameterized), null checks, user context operators
- Column picker panel with search, Select All, Clear All
- Sort order panel with Apply/Cancel pattern (max 2 clauses)
- Searchable entity, attribute, and relationship ComboBox selectors with type-ahead filtering
- Native Dynamics 365 lookup dialog integration for record selection
- Real-time FetchXML preview with copy support
- Save/restore to bound Dataverse text field with full round-trip fidelity (conditions, groups, related entities, columns, sort)
- Responsive single-row toolbar layout
- Error boundary for graceful error handling
- Performance: useMemo/useCallback optimizations, React.memo on key components, centralized metadata caching

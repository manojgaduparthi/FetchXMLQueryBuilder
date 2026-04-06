/**
 * Shared Constants
 *
 * @description Centralized constants for colors, sizes, API configuration, and reusable values
 *
 * All magic numbers, colors, and configuration values are extracted here
 * to enable easy theming, reduce duplication, and eliminate hardcoded values.
 */

import { ConditionOperator } from './types';

// ─── API Configuration ───────────────────────────────────────────────
export const API_VERSION = 'v9.2';
export const ODATA_MAX_VERSION = '4.0';
export const ODATA_VERSION = '4.0';

// ─── Colors ──────────────────────────────────────────────────────────
export const Colors = {
    /** Page background */
    backgroundPage: '#faf9f8',
    /** Card / panel background */
    backgroundCard: '#ffffff',
    /** Nested section background (e.g. related entity card) */
    backgroundSection: '#f3f2f1',
    /** Slightly darker section for hover/zebra rows */
    backgroundHover: '#f0efed',
    /** Code block / dark preview area */
    backgroundCode: '#1e1e1e',
    /** Primary brand blue (Fluent UI default) */
    themePrimary: '#0078d4',
    /** Light tint of primary (badges, subtle highlights) */
    themeLighter: '#deecf9',
    /** Success green */
    themeSuccess: '#107c10',
    /** Warning / attention amber */
    themeWarning: '#ffb900',
    /** Subtle text / placeholder */
    textSubtle: '#797775',
    /** Default text */
    textDefault: '#323130',
    /** Inverted text on dark backgrounds */
    textInverted: '#d4d4d4',
    /** Separator / border */
    borderLight: '#edebe9',
    /** Stronger border for nested groups */
    borderDefault: '#d1d1d1',
    /** Left-accent border */
    borderAccent: '#c8c6c4',
    /** Root-level group border */
    borderPrimary: '#0078d4',
} as const;

// ─── Box Shadow ──────────────────────────────────────────────────────
export const CARD_BOX_SHADOW = '0 1.6px 3.6px rgba(0,0,0,0.1), 0 0.3px 0.9px rgba(0,0,0,0.06)';

// ─── Sizes ───────────────────────────────────────────────────────────
export const Sizes = {
    /** Default button height */
    buttonHeight: 32,
    /** Compact button height (e.g. sort add, filter toggle) */
    buttonHeightCompact: 28,
    /** Standard padding inside cards */
    padding: 16,
    /** Smaller padding for tight areas */
    paddingSmall: 12,
    /** Card border radius */
    borderRadius: 6,
    /** Value input minimum width in ConditionRow */
    valueInputMinWidth: 150,
    /** Attribute dropdown min width in ConditionRow */
    attributeDropdownMinWidth: 200,
    /** Operator dropdown min width in ConditionRow */
    operatorDropdownMinWidth: 160,
    /** Dropdown callout min width */
    dropdownCalloutMinWidth: 300,
    /** Dropdown callout max width */
    dropdownCalloutMaxWidth: 500,
    /** ComboBox options container max height */
    comboBoxMaxHeight: 400,
    /** Column picker max height */
    columnPickerMaxHeight: 500,
    /** Sort direction dropdown width */
    sortDirectionWidth: 150,
    /** Checkbox size for condition selection */
    checkboxSize: 18,
    /** Condition row gap */
    conditionRowGap: 8,
    /** Section title font size */
    sectionTitleFontSize: 13,
    /** Nested group left accent bar width */
    accentBarWidth: 3,
} as const;

// ─── Timing ──────────────────────────────────────────────────────────
/** Auto-dismiss timeout for save notifications (milliseconds) */
export const NOTIFICATION_TIMEOUT_MS = 3000;

// ─── Lookup defaults ─────────────────────────────────────────────────
/** Fallback entity when lookup target cannot be determined */
export const LOOKUP_FALLBACK_ENTITY = 'account';

// ─── Operator groups ─────────────────────────────────────────────────
/** Operators that use text/wildcard search on a virtual "name" attribute */
export const TEXT_SEARCH_OPERATORS: readonly ConditionOperator[] = [
    ConditionOperator.Contains,
    ConditionOperator.DoesNotContain,
    ConditionOperator.BeginsWith,
    ConditionOperator.DoesNotBeginWith,
    ConditionOperator.EndsWith,
    ConditionOperator.DoesNotEndWith,
    ConditionOperator.Like,
    ConditionOperator.NotLike,
] as const;

/** Numeric attribute types that share the same numeric value input */
export const NUMERIC_ATTRIBUTE_TYPES = ['Integer', 'BigInt', 'Decimal', 'Double', 'Money'] as const;

/** Known secondary info fields for common entities (used by LookupService) */
export const SECONDARY_FIELD_MAP: Readonly<Record<string, string>> = {
    systemuser: 'internalemailaddress',
    contact: 'emailaddress1',
    account: 'telephone1',
    lead: 'emailaddress1',
    opportunity: 'estimatedvalue',
    incident: 'ticketnumber',
    quote: 'totalamount',
    salesorder: 'totalamount',
    invoice: 'totalamount',
    product: 'productnumber',
    team: 'teamtype',
} as const;

// ─── FetchXML generation ─────────────────────────────────────────────
export const FETCH_XML_HEADER = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">';

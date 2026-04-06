/**
 * Type Definitions for FetchXML Query Builder
 *
 * @description TypeScript type definitions and interfaces for the FetchXML Query Builder control
 * 
 * This file contains all type definitions used throughout the application including:
 * - FetchXML operators
 * - Query structure models
 * - Metadata interfaces
 */

/**
 * Attribute Metadata Interface
 * Represents metadata for a Dynamics 365 entity attribute/field
 */
export interface AttributeMetadata {
    logicalName: string;        // API name of the attribute (e.g., "accountnumber")
    displayName: string;        // User-friendly name shown in UI (e.g., "Account Number")
    attributeType: string;      // Type of attribute (String, Integer, DateTime, etc.)
    isPrimaryId?: boolean;      // True if this is the primary key field
    targets?: string[];         // For lookup fields: array of target entity logical names
    options?: OptionSetValue[]; // For picklist fields: available option values
}

/**
 * Option Set Value Interface
 * Represents a single option in a picklist/option set field
 */
export interface OptionSetValue {
    value: number;   // Numeric value of the option
    label: string;   // Display label of the option
}

/**
 * Entity Metadata Interface
 * Represents metadata for a complete Dynamics 365 entity
 */
export interface EntityMetadata {
    logicalName: string;           // API name of the entity (e.g., "account")
    displayName: string;           // User-friendly name (e.g., "Account")
    attributes: AttributeMetadata[]; // Array of all queryable attributes
}

/**
 * FetchXML Condition Operators
 * All supported operators for FetchXML query conditions
 * Values match FetchXML operator syntax
 */
export enum ConditionOperator {
    // Comparison operators
    Equal = "eq",
    NotEqual = "ne",
    GreaterThan = "gt",
    GreaterEqual = "ge",
    LessThan = "lt",
    LessEqual = "le",
    
    // Text operators
    Like = "like",
    NotLike = "not-like",
    
    // Collection operators
    In = "in",
    NotIn = "not-in",
    Between = "between",
    NotBetween = "not-between",
    
    // Null check operators
    Null = "null",
    NotNull = "not-null",
    
    // Date operators - relative
    Yesterday = "yesterday",
    Today = "today",
    Tomorrow = "tomorrow",
    Last7Days = "last-7-days",
    Next7Days = "next-7-days",
    LastWeek = "last-week",
    ThisWeek = "this-week",
    NextWeek = "next-week",
    LastMonth = "last-month",
    ThisMonth = "this-month",
    NextMonth = "next-month",
    
    // Date operators - specific
    On = "on",
    OnOrBefore = "on-or-before",
    OnOrAfter = "on-or-after",
    LastYear = "last-year",
    ThisYear = "this-year",
    NextYear = "next-year",
    
    // Date operators - parameterized (require numeric value)
    LastXHours = "last-x-hours",
    NextXHours = "next-x-hours",
    LastXDays = "last-x-days",
    NextXDays = "next-x-days",
    LastXWeeks = "last-x-weeks",
    NextXWeeks = "next-x-weeks",
    LastXMonths = "last-x-months",
    NextXMonths = "next-x-months",
    LastXYears = "last-x-years",
    NextXYears = "next-x-years",
    OlderThanXMinutes = "olderthan-x-minutes",
    OlderThanXHours = "olderthan-x-hours",
    OlderThanXDays = "olderthan-x-days",
    OlderThanXWeeks = "olderthan-x-weeks",
    OlderThanXMonths = "olderthan-x-months",
    OlderThanXYears = "olderthan-x-years",
    
    // String pattern operators
    Contains = "contains",
    DoesNotContain = "does-not-contain",
    BeginsWith = "begins-with",
    DoesNotBeginWith = "does-not-begin-with",
    EndsWith = "ends-with",
    DoesNotEndWith = "does-not-end-with",
    
    // User-specific operators (for lookup fields like Owner, CreatedBy, ModifiedBy)
    EqUserId = "eq-userid",
    NeUserId = "ne-userid",
    EqUserTeams = "eq-userteams",
    EqUserOrUserTeams = "eq-useroruserteams",
    EqUserOrUserHierarchy = "eq-useroruserhierarchy",
    EqUserOrUserHierarchyAndTeams = "eq-useroruserhierarchyandteams"
}

/**
 * Query Condition Interface
 * Represents a single condition in a FetchXML query filter
 */
export interface QueryCondition {
    id: string;                  // Unique identifier for this condition
    attribute: string;           // Attribute logical name to filter on
    operator: ConditionOperator; // Comparison operator to use
    value?: string | number | boolean | string[] | number[] | (string | number)[]; // Primary value(s)
    value2?: string | number;    // Secondary value for "between" operators
}

/**
 * Query Group Interface
 * Represents a group of conditions with AND/OR logic
 * Supports nested groups for complex query structures
 */
export interface QueryGroup {
    id: string;                  // Unique identifier for this group
    operator: 'and' | 'or';      // Logical operator for conditions in this group
    conditions: QueryCondition[]; // Array of conditions in this group
    groups: QueryGroup[];        // Array of nested child groups (recursive)
}

/**
 * Lookup Record Interface
 * Represents a record from a lookup field for display and selection
 */
export interface LookupRecord {
    id: string;          // GUID of the record
    name: string;        // Display name of the record
    entityType: string;  // Entity logical name
    secondaryInfo?: string; // Additional context (e.g., email, account number)
}

/**
 * Link Entity Type
 * Defines the type of join to use in a link-entity relationship
 */
export enum LinkType {
    Inner = "inner",      // Inner join - only records with matching values in both entities
    Outer = "outer",      // Left outer join - all records from primary entity, matching from linked
    Exists = "exists",    // Exists - filter based on existence in related entity
    In = "in",           // In - similar to exists but with different performance characteristics
    MatchFirstRowUsingCrossApply = "matchfirstrowusingcrossapply" // Advanced: match first row only
}

/**
 * Relationship Metadata Interface
 * Represents a relationship between two entities
 */
export interface RelationshipMetadata {
    schemaName: string;              // Unique name of the relationship (e.g., "account_contact")
    referencingEntity: string;       // Child entity logical name (many side)
    referencingAttribute: string;    // Lookup attribute on child entity
    referencedEntity: string;        // Parent entity logical name (one side)
    referencedAttribute: string;     // Primary key on parent entity (usually [entity]id)
    relationshipType: 'OneToMany' | 'ManyToOne' | 'ManyToMany'; // Type of relationship
    intersectEntity?: string;        // For many-to-many: the intersect table name
    referencingAttributeDisplayName?: string; // Display name of the lookup field (e.g., "Regarding", "Account Name")
    referencedEntityDisplayName?: string;     // Display name of the related entity (e.g., "Account", "Contact")
    // OOB Advanced Find filtering property
    isValidForAdvancedFind?: boolean; // Whether this relationship should show in Advanced Find
    // Navigation property names for better display
    referencingEntityNavigationPropertyName?: string; // Single-valued nav property (ManyToOne)
    referencedEntityNavigationPropertyName?: string;  // Collection-valued nav property (OneToMany)
    entity1NavigationPropertyName?: string;          // For ManyToMany Entity1
    entity2NavigationPropertyName?: string;          // For ManyToMany Entity2
    // Associated menu configuration for OOB-matching display behavior
    associatedMenuConfiguration?: {
        Behavior: string; // 'DoNotDisplay' | 'UseCollectionName' | 'UseLabel'
        Group: string;
        Order: number | null;
        Label?: {
            LocalizedLabels: {Label: string; LanguageCode: number}[];
            UserLocalizedLabel?: {Label: string; LanguageCode: number} | null;
        };
        Icon: string | null;
        IsCustomizable: boolean;
        MenuId: string | null;
        QueryApi: string | null;
        ViewId: string;
        AvailableOffline: boolean;
    };
}

/**
 * Link Entity Interface
 * Represents a link-entity element in FetchXML for joining related entities
 */
export interface LinkEntity {
    id: string;                      // Unique identifier for UI tracking
    name: string;                    // Logical name of the entity to link to
    from: string;                    // Attribute in the linked entity (PK or FK)
    to: string;                      // Attribute in the parent entity (FK or PK)
    alias?: string;                  // Alias for the linked entity (for duplicate entity links)
    linkType: LinkType;              // Type of join (inner, outer, etc.)
    intersect?: boolean;             // True if this is a many-to-many intersect entity
    relationship?: RelationshipMetadata; // Metadata about the relationship
    filters?: QueryGroup;            // Conditions to filter the linked entity
    attributes?: string[];           // Specific attributes to retrieve from linked entity
    linkEntities?: LinkEntity[];     // Nested link-entities (relationships of relationships)
}

/**
 * Order-By Clause Interface
 * Represents a single sort directive for query results
 */
export interface OrderBy {
    attribute: string;               // Attribute logical name to sort on
    descending?: boolean;            // true = DESC, false/undefined = ASC
}


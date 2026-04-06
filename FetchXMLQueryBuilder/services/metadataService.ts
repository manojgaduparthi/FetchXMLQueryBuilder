/**
 * Metadata Service
 *
 * @description Service for fetching entity and attribute metadata from Dynamics 365 Dataverse
 * 
 * This service provides methods to retrieve metadata about entities and their attributes
 * using the Dynamics 365 Web API. It implements caching for performance optimization
 * and handles the complex metadata structure returned by the API.
 * 
 * Reference: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
 */

import { AttributeMetadata, EntityMetadata, RelationshipMetadata } from '../types';
import { API_VERSION, ODATA_MAX_VERSION, ODATA_VERSION } from '../constants';

export class MetadataService {
    private readonly context: ComponentFramework.Context<unknown>;
    private readonly entityMetadataCache: Map<string, EntityMetadata>;
    private readonly relationshipCache: Map<string, {
        manyToOne: RelationshipMetadata[];
        oneToMany: RelationshipMetadata[];
        manyToMany: RelationshipMetadata[];
    }>;
    /** Lightweight cache: entity logical name → (attribute logical name → display name) */
    private readonly attrDisplayNameCache: Map<string, Map<string, string>>;
    /** Lightweight cache: entity logical name → { displayName, displayCollectionName } */
    private readonly entityNamesCache: Map<string, { displayName: string; displayCollectionName: string }>;
    
    constructor(context: ComponentFramework.Context<unknown>) {
        this.context = context;
        this.entityMetadataCache = new Map();
        this.relationshipCache = new Map();
        this.attrDisplayNameCache = new Map();
        this.entityNamesCache = new Map();
    }
    
    /**
     * Extract client URL from window location as fallback
     * Uses optional chaining for better compatibility and RegExp.exec for better performance
     */
    private getClientUrlFromWindow(): string | null {
        const locationHref = globalThis.window?.location?.href;
        if (locationHref) {
            const pattern = /(https:\/\/[^/]+\.crm[^/]*\.dynamics\.com)/;
            const match = pattern.exec(locationHref);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    /**
     * Resolve the Dataverse client URL using context or window fallback.
     * Centralised to eliminate repeated URL-resolution logic across methods.
     */
    private getClientUrl(): string {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.context as any).page?.getClientUrl?.() || this.getClientUrlFromWindow() || '';
    }
    
    /**
     * Determine whether a raw attribute should be included in the metadata results.
     * Extracted to reduce cognitive complexity of getEntityMetadata.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private shouldIncludeAttribute(attr: any): boolean {
        const isValidForAdvancedFind = attr.IsValidForAdvancedFind?.Value ?? true;
        const isValidForRead = attr.IsValidForRead?.Value ?? true;
        const isLogical = attr.IsLogical ?? false;

        if (!isValidForAdvancedFind || !isValidForRead) return false;

        // Exception for address fields – Dataverse marks them as logical but they ARE
        // queryable and shown in Advanced Find. Exclude only composite address fields.
        const logName: string = attr.LogicalName ?? '';
        const isAddressField = logName.startsWith('address1_') || logName.startsWith('address2_');
        const isCompositeAddress = logName === 'address1_composite' || logName === 'address2_composite';

        if (isCompositeAddress) return false;
        if (isLogical && !isAddressField) return false;

        return true;
    }

    /**
     * Get metadata for an entity including its attributes
     * Per Microsoft documentation: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
     */
    public async getEntityMetadata(entityLogicalName: string): Promise<EntityMetadata | null> {
        // Dataverse API requires lowercase logical names
        entityLogicalName = entityLogicalName.toLowerCase();

        // Check cache first
        if (this.entityMetadataCache.has(entityLogicalName)) {
            return this.entityMetadataCache.get(entityLogicalName) || null;
        }
        
        try {
            // PCF WebAPI doesn't support EntityDefinition/AttributeMetadata queries
            // We need to use a workaround: retrieve a single record and parse its attributes
            // Or use the direct API endpoint
            
            // Get the API URL from context, with fallback to window location
            const clientUrl = this.getClientUrl();
            // Query attributes - Note: Targets is a collection and must be expanded separately for lookup attributes
            // Cannot use $filter with IsValidForRead in $expand - we'll filter client-side
            const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=LogicalName,DisplayName&$expand=Attributes($select=LogicalName,DisplayName,AttributeType,IsPrimaryId,IsValidForAdvancedFind,IsValidForRead,IsLogical)`;
            
            // Make direct fetch call
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'OData-MaxVersion': ODATA_MAX_VERSION,
                    'OData-Version': ODATA_VERSION,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json; charset=utf-8'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`);
                return null;
            }
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const entityDef: any = await response.json();
            
            const displayName = entityDef.DisplayName?.UserLocalizedLabel?.Label || entityLogicalName;
            const attributes: AttributeMetadata[] = [];
            
            if (entityDef.Attributes && Array.isArray(entityDef.Attributes)) {
                for (const attr of entityDef.Attributes) {
                    if (!this.shouldIncludeAttribute(attr)) continue;
                    
                    const attributeMetadata = this.parseAttributeMetadata(attr);
                    if (attributeMetadata) {
                        attributes.push(attributeMetadata);
                    }
                }
            }
            
            // Sort attributes by display name
            attributes.sort((a, b) => a.displayName.localeCompare(b.displayName));
            
            // Fetch optionset values for picklist/state/status attributes
            await this.loadOptionSetsForAttributes(entityLogicalName, attributes);
            
            // Fetch targets for lookup attributes
            await this.loadTargetsForLookupAttributes(entityLogicalName, attributes);
            
            const metadata: EntityMetadata = {
                logicalName: entityLogicalName,
                displayName,
                attributes
            };
            
            // Cache the result
            this.entityMetadataCache.set(entityLogicalName, metadata);
            
            return metadata;
        } catch (error) {
            console.error('Error retrieving entity metadata:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('Error details:', errorMsg);
            return null;
        }
    }
    
    /**
     * Parse attribute metadata from API response
     */
    private parseAttributeMetadata(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attr: any
    ): AttributeMetadata | null {
        try {
            const logicalName = attr.LogicalName;
            const displayName = attr.DisplayName?.UserLocalizedLabel?.Label || logicalName;
            const attributeType = attr.AttributeType || 'String';
            
            const metadata: AttributeMetadata = {
                logicalName,
                displayName,
                attributeType,
                isPrimaryId: attr.IsPrimaryId || false
            };
            
            // Targets for lookup fields will be loaded separately if needed
            // Options for picklist/state/status will be loaded separately via loadOptionSetsForAttributes
            
            return metadata;
        } catch (error) {
            console.error('Error parsing attribute metadata:', error);
            return null;
        }
    }
    
    /**
     * Load OptionSet values for picklist/state/status attributes
     * Must use casting to PicklistAttributeMetadata to access OptionSet/GlobalOptionSet
     */
    private async loadOptionSetsForAttributes(
        entityLogicalName: string,
        attributes: AttributeMetadata[]
    ): Promise<void> {
        try {
            // Get the API URL from context
            const clientUrl = this.getClientUrl();
            
            // Filter for picklist-type attributes that need options loaded
            const picklistAttributes = attributes.filter(attr => 
                (attr.attributeType === 'Picklist' || 
                 attr.attributeType === 'State' || 
                 attr.attributeType === 'Status') &&
                !attr.options // Only load if not already loaded
            );
            
            // Fetch options for all picklist attributes in parallel for better performance
            // Per Microsoft docs: must cast to the appropriate metadata type
            await Promise.all(picklistAttributes.map(async (attr) => {
                try {
                    const apiUrl = this.buildOptionSetApiUrl(clientUrl, entityLogicalName, attr);
                    
                    const response = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'OData-MaxVersion': '4.0',
                            'OData-Version': '4.0'
                        }
                    });
                    
                    if (response.ok) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const data: any = await response.json();
                        
                        // Options can be in OptionSet or GlobalOptionSet
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const optionSet: any = data.OptionSet || data.GlobalOptionSet;
                        const options = optionSet?.Options;
                        
                        if (options && Array.isArray(options)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            attr.options = options.map((opt: any) => ({
                                value: opt.Value,
                                label: opt.Label?.UserLocalizedLabel?.Label || String(opt.Value)
                            }));
                        } else {
                            console.warn(`No options found for ${attr.logicalName} (${attr.attributeType})`);
                        }
                    } else {
                        console.error(`HTTP ${response.status} loading options for ${attr.logicalName}:`, await response.text());
                    }
                } catch (error) {
                    console.error(`Error loading options for ${attr.logicalName}:`, error);
                    // Continue with other attributes even if one fails
                }
            }));
        } catch (error) {
            console.error('Error loading optionsets:', error);
        }
    }
    
    /**
     * Build the appropriate API URL for fetching OptionSet data based on attribute type
     */
    private buildOptionSetApiUrl(clientUrl: string, entityLogicalName: string, attr: AttributeMetadata): string {
        const baseUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attr.logicalName}')`;
        
        // State attributes use StateAttributeMetadata
        if (attr.attributeType === 'State') {
            return `${baseUrl}/Microsoft.Dynamics.CRM.StateAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`;
        }
        // Status attributes use StatusAttributeMetadata
        else if (attr.attributeType === 'Status') {
            return `${baseUrl}/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`;
        }
        // Regular picklists use PicklistAttributeMetadata
        else {
            return `${baseUrl}/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options),GlobalOptionSet($select=Options)`;
        }
    }
    
    /**
     * Load Targets for lookup/customer/owner attributes
     * Targets must be retrieved individually per attribute with proper casting
     */
    private async loadTargetsForLookupAttributes(
        entityLogicalName: string,
        attributes: AttributeMetadata[]
    ): Promise<void> {
        try {
            const clientUrl = this.getClientUrl();
            
            // Filter for lookup-type attributes that don't have targets yet
            const lookupAttributes = attributes.filter(attr => 
                (attr.attributeType === 'Lookup' || 
                 attr.attributeType === 'Customer' || 
                 attr.attributeType === 'Owner') &&
                !attr.targets
            );
            
            // Fetch targets for all lookup attributes in parallel for better performance
            await Promise.all(lookupAttributes.map(async (attr) => {
                try {
                    // Cast to LookupAttributeMetadata to access Targets collection
                    const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attr.logicalName}')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`;
                    
                    const response = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json; charset=utf-8',
                            'OData-MaxVersion': '4.0',
                            'OData-Version': '4.0'
                        }
                    });
                    
                    if (response.ok) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const data: any = await response.json();
                        
                        if (data.Targets && Array.isArray(data.Targets)) {
                            attr.targets = data.Targets;
                        }
                    }
                } catch (error) {
                    console.error(`Error loading targets for ${attr.logicalName}:`, error);
                    // Continue with other attributes even if one fails
                }
            }));
        } catch (error) {
            console.error('Error loading lookup targets:', error);
        }
    }
    
    /**
     * Get all entities available for Advanced Find
     * Uses direct fetch() API as retrieveMultipleRecords may not support EntityDefinition
     */
    public async getAllEntities(): Promise<{ logicalName: string; displayName: string }[]> {
        try {
            // Get the API URL from context, with fallback to window location
            const clientUrl = this.getClientUrl();
            
            // Query EntityDefinitions - get all entities and filter in JavaScript
            // Per Microsoft docs: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
            // Note: Some Dataverse environments may not support $filter on EntityDefinitions
            // So we retrieve all entities and filter client-side
            const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions?$select=LogicalName,DisplayName,DisplayCollectionName,IsValidForAdvancedFind`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'OData-MaxVersion': '4.0',
                    'OData-Version': '4.0',
                    'Accept': 'application/json',
                    'Content-Type': 'application/json; charset=utf-8'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                console.error(`HTTP error retrieving entities! status: ${response.status}`);
                // Try to get error details
                try {
                    const errorData = await response.json();
                    console.error('Error details:', errorData);
                } catch (parseError) {
                    console.error('Could not parse error response:', parseError);
                }
                return [];
            }
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = await response.json();
            
            if (!data.value || !Array.isArray(data.value)) {
                console.error('[getAllEntities] No valid data.value array');
                return [];
            }
            
            // Filter and map entities
            const entities: { logicalName: string; displayName: string; displayCollectionName?: string }[] = data.value
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((entity: any) => {
                    // Filter for entities valid for Advanced Find
                    // When using $select, IsValidForAdvancedFind is returned as a direct boolean
                    return entity.IsValidForAdvancedFind === true;
                })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((entity: any) => ({
                    logicalName: entity.LogicalName,
                    displayName: entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName,
                    displayCollectionName: entity.DisplayCollectionName?.UserLocalizedLabel?.Label || undefined
                }));
            
            // Sort alphabetically by display name
            entities.sort((a: { displayName: string }, b: { displayName: string }) => 
                a.displayName.localeCompare(b.displayName)
            );
            
            return entities;
        } catch (error) {
            console.error('[getAllEntities] Exception:', error);
            return [];
        }
    }
    
    /**
     * Fetch both singular and collection display names for a list of entities.
     * Returns Map<logicalName, { singularName, collectionName }>.
     * Uses entityNamesCache for efficiency.
     */
    public async getEntityNamesForList(logicalNames: string[]): Promise<Map<string, { singularName: string; collectionName: string }>> {
        const result = new Map<string, { singularName: string; collectionName: string }>();
        if (logicalNames.length === 0) return result;

        const clientUrl = this.getClientUrl();
        if (!clientUrl) return result;

        await Promise.all(logicalNames.map(async logName => {
            // Serve from cache first
            const cached = this.entityNamesCache.get(logName);
            if (cached) {
                result.set(logName, {
                    singularName: cached.displayName || logName,
                    collectionName: cached.displayCollectionName || cached.displayName || logName
                });
                return;
            }
            try {
                const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${logName}')?$select=DisplayName,DisplayCollectionName&LabelLanguages=1033`;
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                });
                if (!response.ok) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data: any = await response.json();
                const displayName: string = data.DisplayName?.UserLocalizedLabel?.Label || logName;
                const displayCollectionName: string = data.DisplayCollectionName?.UserLocalizedLabel?.Label || displayName;
                this.entityNamesCache.set(logName, { displayName, displayCollectionName });
                result.set(logName, { singularName: displayName, collectionName: displayCollectionName });
            } catch {
                // leave this entity out; caller falls back to formatEntityFallback
            }
        }));

        return result;
    }

    /**
     * Lightweight fetch: returns a Map of attribute logicalName → displayName for an entity.
     * Uses its own cache so it does not interfere with full entity metadata loading.
     * Called in the background after relationships are loaded to power the related-entity
     * dropdown label for OneToMany relationships (where the lookup lives on the child entity).
     */
    public async getAttributeDisplayNameMap(entityLogicalName: string): Promise<Map<string, string>> {
        entityLogicalName = entityLogicalName.toLowerCase();
        const cached = this.attrDisplayNameCache.get(entityLogicalName);
        if (cached) return cached;

        try {
            const clientUrl = this.getClientUrl();
            if (!clientUrl) return new Map();

            // Only fetch LogicalName + DisplayName — much lighter than full attribute load
            const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,DisplayName&LabelLanguages=1033`;

            const response = await fetch(apiUrl, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'OData-MaxVersion': '4.0',
                    'OData-Version': '4.0'
                }
            });

            if (!response.ok) return new Map();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = await response.json();
            const map = new Map<string, string>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (data.value || []).forEach((attr: any) => {
                const logName: string = attr.LogicalName;
                const dispName: string | undefined = attr.DisplayName?.UserLocalizedLabel?.Label;
                if (logName && dispName) map.set(logName, dispName);
            });

            this.attrDisplayNameCache.set(entityLogicalName, map);
            return map;
        } catch {
            return new Map();
        }
    }

    /**
     * Get Many-to-One relationships for an entity
     * These are lookup fields on the current entity pointing to other entities
     * Per Microsoft documentation: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
     */
    public async getManyToOneRelationships(entityLogicalName: string): Promise<RelationshipMetadata[]> {
        entityLogicalName = entityLogicalName.toLowerCase();
        try {
            const clientUrl = this.getClientUrl();
            if (!clientUrl) {
                console.error('[getManyToOneRelationships] Could not determine client URL');
                return [];
            }
            
            const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')/ManyToOneRelationships?$select=SchemaName,ReferencingEntity,ReferencingAttribute,ReferencedEntity,ReferencedAttribute,IsValidForAdvancedFind,ReferencingEntityNavigationPropertyName,AssociatedMenuConfiguration`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                credentials: 'include', // Send cookies for authentication
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'OData-MaxVersion': '4.0',
                    'OData-Version': '4.0'
                }
            });
            
            if (!response.ok) {
                console.error('[getManyToOneRelationships] HTTP Error:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('[getManyToOneRelationships] Error body:', errorText);
                return [];
            }
            
            const data = await response.json();
            
            // Map the API response to our RelationshipMetadata interface
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relationships = (data.value || []).map((rel: any) => ({
                schemaName: rel.SchemaName,
                referencingEntity: rel.ReferencingEntity,
                referencingAttribute: rel.ReferencingAttribute,
                referencedEntity: rel.ReferencedEntity,
                referencedAttribute: rel.ReferencedAttribute,
                relationshipType: 'ManyToOne' as const,
                isValidForAdvancedFind: rel.IsValidForAdvancedFind,
                referencingEntityNavigationPropertyName: rel.ReferencingEntityNavigationPropertyName,
                associatedMenuConfiguration: rel.AssociatedMenuConfiguration
            }));
            
            return relationships;
        } catch (error) {
            console.error('[getManyToOneRelationships] Exception:', error);
            return [];
        }
    }

    /**
     * Get One-to-Many relationships for an entity
     * These are relationships where other entities have lookup fields pointing to the current entity
     * Per Microsoft documentation: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
     */
    public async getOneToManyRelationships(entityLogicalName: string): Promise<RelationshipMetadata[]> {
        entityLogicalName = entityLogicalName.toLowerCase();
        try {
            const clientUrl = this.getClientUrl();
            if (!clientUrl) {
                console.error('[getOneToManyRelationships] Could not determine client URL');
                return [];
            }
            
            const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')/OneToManyRelationships?$select=SchemaName,ReferencingEntity,ReferencingAttribute,ReferencedEntity,ReferencedAttribute,IsValidForAdvancedFind,ReferencedEntityNavigationPropertyName,AssociatedMenuConfiguration`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                credentials: 'include', // Send cookies for authentication
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'OData-MaxVersion': '4.0',
                    'OData-Version': '4.0'
                }
            });
            
            if (!response.ok) {
                console.error('[getOneToManyRelationships] HTTP Error:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('[getOneToManyRelationships] Error body:', errorText);
                return [];
            }
            
            const data = await response.json();
            
            // Map the API response to our RelationshipMetadata interface
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relationships = (data.value || []).map((rel: any) => ({
                schemaName: rel.SchemaName,
                referencingEntity: rel.ReferencingEntity,
                referencingAttribute: rel.ReferencingAttribute,
                referencedEntity: rel.ReferencedEntity,
                referencedAttribute: rel.ReferencedAttribute,
                relationshipType: 'OneToMany' as const,
                isValidForAdvancedFind: rel.IsValidForAdvancedFind,
                referencedEntityNavigationPropertyName: rel.ReferencedEntityNavigationPropertyName,
                associatedMenuConfiguration: rel.AssociatedMenuConfiguration
            }));
            
            return relationships;
        } catch (error) {
            console.error('[getOneToManyRelationships] Exception:', error);
            return [];
        }
    }

    /**
     * Get Many-to-Many relationships for an entity
     * These are relationships through an intersect table
     * Per Microsoft documentation: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
     */
    public async getManyToManyRelationships(entityLogicalName: string): Promise<RelationshipMetadata[]> {
        entityLogicalName = entityLogicalName.toLowerCase();
        try {
            const clientUrl = this.getClientUrl();
            if (!clientUrl) {
                console.error('[getManyToManyRelationships] Could not determine client URL');
                return [];
            }
            
            const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')/ManyToManyRelationships?$select=SchemaName,Entity1LogicalName,Entity1IntersectAttribute,Entity2LogicalName,Entity2IntersectAttribute,IntersectEntityName,IsValidForAdvancedFind,Entity1NavigationPropertyName,Entity2NavigationPropertyName,Entity1AssociatedMenuConfiguration,Entity2AssociatedMenuConfiguration`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                credentials: 'include', // Send cookies for authentication
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'OData-MaxVersion': '4.0',
                    'OData-Version': '4.0'
                }
            });
            
            if (!response.ok) {
                console.error('[getManyToManyRelationships] HTTP Error:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('[getManyToManyRelationships] Error body:', errorText);
                return [];
            }
            
            const data = await response.json();
            
            // Map the API response to our RelationshipMetadata interface
            // For Many-to-Many, we need to determine which entity is the "other" entity
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relationships = (data.value || []).map((rel: any) => {
                const isEntity1 = rel.Entity1LogicalName === entityLogicalName;
                const otherEntity = isEntity1 ? rel.Entity2LogicalName : rel.Entity1LogicalName;
                const thisAttribute = isEntity1 ? rel.Entity1IntersectAttribute : rel.Entity2IntersectAttribute;
                const otherAttribute = isEntity1 ? rel.Entity2IntersectAttribute : rel.Entity1IntersectAttribute;
                // For M2M, the AssociatedMenuConfiguration on the OTHER entity's side
                // determines the display behavior (UseLabel, UseCollectionName, DoNotDisplay)
                const otherConfig = isEntity1 ? rel.Entity2AssociatedMenuConfiguration : rel.Entity1AssociatedMenuConfiguration;
                
                return {
                    schemaName: rel.SchemaName,
                    referencingEntity: entityLogicalName,
                    referencingAttribute: thisAttribute,
                    referencedEntity: otherEntity,
                    referencedAttribute: otherAttribute,
                    relationshipType: 'ManyToMany' as const,
                    intersectEntity: rel.IntersectEntityName,
                    isValidForAdvancedFind: rel.IsValidForAdvancedFind,
                    entity1NavigationPropertyName: rel.Entity1NavigationPropertyName,
                    entity2NavigationPropertyName: rel.Entity2NavigationPropertyName,
                    associatedMenuConfiguration: otherConfig
                };
            });
            
            return relationships;
        } catch (error) {
            console.error('[getManyToManyRelationships] Exception:', error);
            return [];
        }
    }

    /**
     * Get all relationships for an entity (Many-to-One and One-to-Many combined)
     * Retrieves both directions of relationships in parallel for better performance
     * IMPORTANT: Filters relationships based on IsValidForAdvancedFind to match OOB Advanced Find behavior
     */
    public async getAllRelationships(entityLogicalName: string): Promise<{
        manyToOne: RelationshipMetadata[];
        oneToMany: RelationshipMetadata[];
        manyToMany: RelationshipMetadata[];
    }> {
        // Return cached result if available
        const cached = this.relationshipCache.get(entityLogicalName);
        if (cached) {
            return cached;
        }

        try {
            // Fetch all relationship types in parallel for optimal performance
            const [manyToOne, oneToMany, manyToMany] = await Promise.all([
                this.getManyToOneRelationships(entityLogicalName),
                this.getOneToManyRelationships(entityLogicalName),
                this.getManyToManyRelationships(entityLogicalName)
            ]);

            // Filter relationships to match OOB Advanced Find behavior.
            // Keep all relationships with IsValidForAdvancedFind != false in the data layer
            // so FetchXML round-trip works even for DoNotDisplay relationships.
            // UI-level filtering (DoNotDisplay exclusion) is done in RelatedEntitySelector.
            // NOTE: IsValidForAdvancedFind on relationships is a BooleanManagedProperty
            // (same as on attributes), so we must check .Value, not the object itself.
            const filterRelationship = (rel: RelationshipMetadata): boolean => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const raw = (rel as any).isValidForAdvancedFind;
                // Handle both BooleanManagedProperty { Value: false } and direct boolean false
                const isValid = (raw !== null && typeof raw === 'object') ? raw.Value : raw;
                if (isValid === false) {
                    return false;
                }
                return true;
            };

            const filteredManyToOne = manyToOne.filter(filterRelationship);
            const filteredOneToMany = oneToMany.filter(filterRelationship);
            const filteredManyToMany = manyToMany.filter(filterRelationship);

            const result = {
                manyToOne: filteredManyToOne,
                oneToMany: filteredOneToMany,
                manyToMany: filteredManyToMany
            };
            // Cache the result for subsequent calls
            this.relationshipCache.set(entityLogicalName, result);
            return result;
        } catch (error) {
            console.error('[getAllRelationships] Exception:', error);
            return {
                manyToOne: [],
                oneToMany: [],
                manyToMany: []
            };
        }
    }
}


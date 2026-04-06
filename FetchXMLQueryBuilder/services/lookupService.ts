/**
 * Lookup Service
 *
 * @description Service for searching and retrieving lookup records from Dynamics 365
 * 
 * This service provides methods to search for records by name and retrieve
 * record details for lookup fields. It dynamically queries entity metadata
 * to determine the primary name field for each entity type.
 */

import { LookupRecord } from '../types';
import { SECONDARY_FIELD_MAP, API_VERSION } from '../constants';

export class LookupService {
    private readonly context: ComponentFramework.Context<unknown>;
    
    // Cache for primary name fields to avoid repeated metadata queries
    private readonly primaryNameFieldCache = new Map<string, string>();
    
    // Cache for secondary info fields
    private readonly secondaryFieldCache = new Map<string, string | null>();
    
    constructor(context: ComponentFramework.Context<unknown>) {
        this.context = context;
    }
    
    /**
     * Get a meaningful secondary field dynamically from entity metadata
     * Looks for common fields like email, phone, or the first String attribute after the primary name
     */
    private async getSecondaryInfoField(entityName: string): Promise<string | null> {
        // Check cache first
        if (this.secondaryFieldCache.has(entityName)) {
            return this.secondaryFieldCache.get(entityName)!;
        }
        
        const secondaryField = SECONDARY_FIELD_MAP[entityName.toLowerCase()] || null;
        this.secondaryFieldCache.set(entityName, secondaryField);
        return secondaryField;
    }
    
    /**
     * Get the primary name field for an entity dynamically from metadata
     */
    private async getPrimaryNameField(entityLogicalName: string): Promise<string> {
        entityLogicalName = entityLogicalName.toLowerCase();
        // Check cache first
        if (this.primaryNameFieldCache.has(entityLogicalName)) {
            return this.primaryNameFieldCache.get(entityLogicalName)!;
        }
        
        try {
            // Get client URL from context
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const clientUrl = (this.context as any).page?.getClientUrl?.() || '';
            
            // Query entity metadata to get PrimaryNameAttribute
            const apiUrl = `${clientUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=PrimaryNameAttribute`;
            
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
                console.error(`Failed to get metadata for ${entityLogicalName}: ${response.status}`);
                // Fallback to 'name' as default
                return 'name';
            }
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const metadata: any = await response.json();
            const primaryNameField = metadata.PrimaryNameAttribute || 'name';
            
            // Cache the result
            this.primaryNameFieldCache.set(entityLogicalName, primaryNameField);
            
            return primaryNameField;
            
        } catch (error) {
            console.error(`Error getting primary name field for ${entityLogicalName}:`, error);
            // Fallback to 'name' as default
            return 'name';
        }
    }
    
    /**
     * Get a specific record by ID
     * @param entityName The logical name of the entity
     * @param recordId The GUID of the record
     * @returns The lookup record or null if not found
     */
    public async getRecordById(
        entityName: string,
        recordId: string
    ): Promise<LookupRecord | null> {
        try {
            if (!recordId) {
                return null;
            }
            
            const primaryNameField = await this.getPrimaryNameField(entityName);
            const secondaryField = await this.getSecondaryInfoField(entityName);
            const idField = `${entityName}id`;
            
            // Build select clause
            let selectClause = `${idField},${primaryNameField}`;
            if (secondaryField) {
                selectClause += `,${secondaryField}`;
            }
            
            // Retrieve the specific record
            const options = `?$select=${selectClause}`;
            const entity = await this.context.webAPI.retrieveRecord(entityName, recordId, options);
            
            if (!entity) {
                return null;
            }
            
            return {
                id: entity[idField] as string,
                name: entity[primaryNameField] as string || '(No Name)',
                entityType: entityName,
                secondaryInfo: secondaryField ? (entity[secondaryField] as string) : undefined
            };
            
        } catch (error) {
            console.error(`Error retrieving ${entityName} record ${recordId}:`, error);
            return null;
        }
    }
    
}

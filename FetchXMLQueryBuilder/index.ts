/**
 * FetchXML Query Builder - PCF Control Entry Point
 *
 * @description Power Apps Component Framework control for building FetchXML queries visually
 * @license MIT
 *
 * This control provides a user-friendly interface for constructing FetchXML queries
 * similar to the Advanced Find experience in Dynamics 365. It supports:
 * - Dynamic entity and attribute selection
 * - All FetchXML operators and conditions
 * - Nested AND/OR groups
 * - Related entity joins with filter conditions
 * - Column selection and sort order
 * - Real-time FetchXML generation
 * - Save and restore functionality
 */

import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { initializeIcons } from '@fluentui/react';
import { FetchXMLQueryBuilder as FetchXMLQueryBuilderComponent } from './components/FetchXMLQueryBuilder';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MetadataService } from './services/metadataService';
import { FetchXMLParser, parseLinkEntities } from './utils/fetchXmlParser';
import { EntityMetadata, QueryGroup, LinkEntity, OrderBy } from './types';

// Initialize Fluent UI icons for consistent Microsoft design
initializeIcons();

/**
 * FetchXML Query Builder Control
 * 
 * Main PCF control class that implements the Power Apps Component Framework standard control interface.
 * This control manages the lifecycle of the FetchXML query builder, including initialization, updates,
 * rendering, and cleanup.
 */
export class FetchXMLQueryBuilder implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    // PCF Framework properties
    private container: HTMLDivElement;
    private notifyOutputChanged: () => void;
    private context: ComponentFramework.Context<IInputs>;
    
    // Services
    private metadataService: MetadataService;
    
    // State management
    private entityMetadata: EntityMetadata | null = null;
    private isLoading = false;
    private error: string | null = null;
    private currentEntityName = '';
    private generatedFetchXML = '';
    private currentQueryGroup: QueryGroup | null = null;
    private currentLinkEntities: LinkEntity[] = []; // Stored link-entities from parsed FetchXML
    private currentOrderBy: OrderBy[] = [];         // Stored sort clauses from parsed FetchXML
    private isSavingToField = false;                // Guard against double-save race
    private availableEntities: { logicalName: string; displayName: string; displayCollectionName?: string }[] = [];
    private entitiesLoaded = false;

    /**
     * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
     * Data-set values are not initialized here, use updateView.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
     * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
     * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
     * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this.container = container;
        this.notifyOutputChanged = notifyOutputChanged;
        this.context = context;
        this.metadataService = new MetadataService(context);
        
        // Set minimum height for the control
        this.container.style.minHeight = '400px';
        
        // Read the initial value from the bound field (if it exists from previous save)
        const savedFetchXML = context.parameters.fetchXML.raw;
        
        // Initialize state from saved FetchXML if available
        this.initializeFromSavedFetchXML(savedFetchXML);
        
        // Determine entity name using priority logic
        const entityName = this.determineEntityName(savedFetchXML, context.parameters.targetEntity.raw);
        
        // Load entities list for dropdown (async, don't block)
        this.loadAvailableEntities();
        
        // If we have an entity name, load its metadata
        if (entityName) {
            this.currentEntityName = entityName;
            this.loadEntityMetadata(entityName);
        } else {
            // No entity specified, render with entity selector
            this.renderControl();
        }
    }

    /**
     * Initialize control state from saved FetchXML
     */
    private initializeFromSavedFetchXML(savedFetchXML: string | null): void {
        if (!savedFetchXML) {
            return;
        }

        this.generatedFetchXML = savedFetchXML;
        
        // Parse saved FetchXML back into a QueryGroup to restore UI state
        const parsed = FetchXMLParser.parse(savedFetchXML);
        if (parsed) {
            this.currentQueryGroup = parsed;
        }
        
        // Parse link-entities from saved FetchXML
        const linkEntities = parseLinkEntities(savedFetchXML);
        if (linkEntities && linkEntities.length > 0) {
            this.currentLinkEntities = linkEntities;
        }

        // Parse sort order from saved FetchXML
        const parsedOrderBy = FetchXMLParser.parseOrderBy(savedFetchXML);
        if (parsedOrderBy.length > 0) {
            this.currentOrderBy = parsedOrderBy;
        }
    }

    /**
     * Determine entity name using priority logic:
     * 1. Extract from saved FetchXML (user's previous selection)
     * 2. Use targetEntity property (configured default)
     * 3. Return empty string (show entity selector)
     */
    private determineEntityName(savedFetchXML: string | null, targetEntity: string | null): string {
        // Priority 1: Extract from saved FetchXML
        if (savedFetchXML) {
            const extractedEntity = FetchXMLParser.extractEntityName(savedFetchXML);
            if (extractedEntity) {
                return extractedEntity.toLowerCase();
            }
        }
        
        // Priority 2: Use targetEntity property if no entity from FetchXML
        // Normalize to lowercase — Dataverse API requires lowercase logical names
        if (targetEntity && targetEntity.trim() !== '') {
            return targetEntity.trim().toLowerCase();
        }
        
        // Priority 3: No entity specified
        return '';
    }

    /**
     * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
     */
    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
        
        // In universal mode, we DON'T reset entity based on targetEntity property
        // The user's selection in the dropdown should persist
        // Only update saved FetchXML if it changed externally (e.g., from database)
        const savedFetchXML = context.parameters.fetchXML.raw;
        if (savedFetchXML && savedFetchXML !== this.generatedFetchXML) {
            this.generatedFetchXML = savedFetchXML;
            
            // Extract entity from the new FetchXML
            const extractedEntity = FetchXMLParser.extractEntityName(savedFetchXML);
            if (extractedEntity && extractedEntity !== this.currentEntityName) {
                // Entity changed in the saved FetchXML - reload metadata
                this.currentEntityName = extractedEntity;
                this.entityMetadata = null;
                this.loadEntityMetadata(extractedEntity);
            }
            
            // Try to restore QueryGroup from saved FetchXML
            const parsed = FetchXMLParser.parse(savedFetchXML);
            if (parsed) {
                this.currentQueryGroup = parsed;
            }
            // Also restore link-entities from the updated FetchXML
            this.currentLinkEntities = parseLinkEntities(savedFetchXML);
            // Restore sort order from the updated FetchXML
            this.currentOrderBy = FetchXMLParser.parseOrderBy(savedFetchXML);
            this.renderControl();
        }
    }

    /**
     * It is called by the framework prior to a control receiving new data.
     * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as "bound" or "output"
     */
    public getOutputs(): IOutputs {
        return {
            fetchXML: this.generatedFetchXML
        };
    }

    /**
     * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
     * i.e. cancelling any pending remote calls, removing listeners, etc.
     */
    public destroy(): void {
        ReactDOM.unmountComponentAtNode(this.container);
    }
    
    /**
     * Load available entities for dropdown
     */
    private async loadAvailableEntities(): Promise<void> {
        if (this.entitiesLoaded) {
            return; // Already loaded
        }
        
        try {
            const entities = await this.metadataService.getAllEntities();
            this.availableEntities = entities;
            this.entitiesLoaded = true;
            // Re-render to show the entity dropdown now that entities are loaded
            this.renderControl();
        } catch (err) {
            console.error('Error loading entities list:', err);
            // Don't set error state - entity list is optional
            // But still mark as loaded to prevent retry loops
            this.entitiesLoaded = true;
        }
    }

    /**
     * Load entity metadata
     */
    private async loadEntityMetadata(entityName: string): Promise<void> {
        this.isLoading = true;
        this.error = null;
        this.renderControl();
        
        try {
            const metadata = await this.metadataService.getEntityMetadata(entityName);
            
            if (metadata) {
                this.entityMetadata = metadata;
                this.error = null;
            } else {
                this.error = `Failed to load metadata for entity: ${entityName}`;
            }
        } catch (err) {
            console.error('Error loading entity metadata:', err);
            this.error = `Error loading metadata: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            this.isLoading = false;
            this.renderControl();
        }
    }
    
    /**
     * Handle query change from React component
     */
    private readonly handleQueryChange = (fetchXML: string, queryGroup: QueryGroup): void => {
        // Check if the value actually changed
        if (this.generatedFetchXML === fetchXML) {
            return;
        }
        
        this.generatedFetchXML = fetchXML;
        this.currentQueryGroup = queryGroup;
        this.notifyOutputChanged();
    };
    
    /**
     * Handle entity change from UI dropdown
     */
    private readonly handleEntityChange = (entityName: string): void => {
        if (entityName === this.currentEntityName) {
            return;
        }
        
        // Clear current query and metadata
        this.currentEntityName = entityName;
        this.entityMetadata = null;
        this.currentQueryGroup = null;
        this.generatedFetchXML = '';
        
        // Notify that output has changed (cleared)
        this.notifyOutputChanged();
        
        // Load new entity metadata
        this.loadEntityMetadata(entityName);
    };
    
    /**
     * Save FetchXML directly to the field using WebAPI
     */
    private readonly handleSaveToField = async (): Promise<void> => {
        // Guard against concurrent saves (e.g., double-click)
        if (this.isSavingToField) return;
        this.isSavingToField = true;
        try {
            // Get the current record ID and entity name
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recordId = (this.context.mode as any).contextInfo?.entityId;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const entityName = (this.context.mode as any).contextInfo?.entityTypeName;
            
            if (!recordId || !entityName) {
                // Show alert for unsaved record
                this.context.navigation.openAlertDialog({
                    text: 'Please save the record first before saving the query.',
                    confirmButtonLabel: 'OK'
                });
                return;
            }
            
            // Get the bound field's logical name dynamically from the property
            const boundFieldName = this.context.parameters.fetchXML.attributes?.LogicalName;
            
            if (!boundFieldName) {
                console.error('Could not determine bound field name');
                this.context.navigation.openAlertDialog({
                    text: 'Error: Could not determine which field to save to.',
                    confirmButtonLabel: 'OK'
                });
                return;
            }
            
            // Update the field directly using WebAPI
            // If no query (empty string), save null to clear the field completely
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updateData: any = {
                [boundFieldName]: this.generatedFetchXML || null
            };
            
            await this.context.webAPI.updateRecord(entityName, recordId, updateData);
            // Success is communicated via the in-control auto-dismissing notification
            // (no modal blocking dialog)
            return;
        } catch (error) {
            console.error('Error saving to field:', error);
            throw error;
        } finally {
            this.isSavingToField = false;
        }
    };
    
    /**
     * Render the React component
     */
    private renderControl(): void {
        // Always show entity dropdown (fully universal mode)
        // targetEntity property now acts as a default/initial value only
        const allowEntityChange = true;
        
        ReactDOM.render(
            React.createElement(ErrorBoundary, null,
                React.createElement(FetchXMLQueryBuilderComponent, {
                    entityName: this.currentEntityName,
                    metadata: this.entityMetadata,
                    isLoading: this.isLoading,
                    error: this.error,
                    initialGroup: this.currentQueryGroup || undefined,
                    initialLinkEntities: this.currentLinkEntities.length > 0 ? this.currentLinkEntities : undefined,
                    initialOrderBy: this.currentOrderBy.length > 0 ? this.currentOrderBy : undefined,
                    onQueryChange: this.handleQueryChange,
                    onSaveToField: this.handleSaveToField,
                    availableEntities: this.availableEntities,
                    onEntityChange: this.handleEntityChange,
                    allowEntityChange,
                    context: this.context
                })
            ),
            this.container
        );
    }
}

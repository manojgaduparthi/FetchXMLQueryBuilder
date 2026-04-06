/**
 * FetchXML Query Builder Component
 *
 * @description Main component for building FetchXML queries with a visual interface
 *
 * This component provides the primary user interface for building FetchXML queries.
 * It manages the query state, entity selection, and coordinates with child components
 * to render the complete query builder experience.
 */

import * as React from 'react';
import { Stack, Spinner, SpinnerSize, MessageBar, MessageBarType, TextField, PrimaryButton, DefaultButton, Label, Dropdown, IDropdownOption, IconButton, Panel, PanelType, Checkbox, Text, ComboBox, IComboBox, IComboBoxOption, SearchBox } from '@fluentui/react';
import { QueryGroup, EntityMetadata, LinkEntity, RelationshipMetadata, LinkType, OrderBy } from '../types';
import { QueryGroupComponent } from './QueryGroupComponent';
import { RelatedEntitySelector } from './RelatedEntitySelector';
import { FetchXMLGenerator } from '../utils/fetchXmlGenerator';
import { MetadataService } from '../services/metadataService';
import { Colors, CARD_BOX_SHADOW, Sizes, NOTIFICATION_TIMEOUT_MS } from '../constants';

interface FetchXMLQueryBuilderProps {
    entityName: string;
    metadata: EntityMetadata | null;
    isLoading: boolean;
    error: string | null;
    initialGroup?: QueryGroup;
    initialLinkEntities?: LinkEntity[]; // For restoring saved link-entities
    initialOrderBy?: OrderBy[];         // For restoring saved sort order
    onQueryChange: (fetchXML: string, queryGroup: QueryGroup) => void;
    onSaveToField?: () => Promise<void>;
    availableEntities?: { logicalName: string; displayName: string; displayCollectionName?: string }[];
    onEntityChange?: (entityName: string) => void;
    allowEntityChange?: boolean;
    context?: ComponentFramework.Context<unknown>; // Optional: enables lookup picker
}

/**
 * Panel Footer Component for Column Picker
 */
const PanelFooter: React.FC<{ onApply: () => void; onCancel: () => void }> = ({ onApply, onCancel }) => (
    <Stack horizontal tokens={{ childrenGap: 8 }}>
        <PrimaryButton text="Apply" onClick={onApply} styles={{ root: { borderRadius: Sizes.borderRadius } }} />
        <DefaultButton text="Cancel" onClick={onCancel} styles={{ root: { borderRadius: Sizes.borderRadius } }} />
    </Stack>
);

/**
 * Background-load display names for entities referenced by relationships.
 * Extracted as a standalone function to reduce nesting depth inside the useEffect.
 */
async function loadRelationshipDisplayNames(
    relationships: { manyToOne: RelationshipMetadata[]; oneToMany: RelationshipMetadata[]; manyToMany: RelationshipMetadata[] },
    ctx: ComponentFramework.Context<unknown>,
    cancelToken: { cancelled: boolean },
    setRelatedAttrNames: React.Dispatch<React.SetStateAction<Map<string, Map<string, string>>>>,
    setAdditionalCollectionNames: React.Dispatch<React.SetStateAction<Map<string, string>>>,
    setAdditionalSingularNames: React.Dispatch<React.SetStateAction<Map<string, string>>>
): Promise<void> {
    const o2mEntities = relationships.oneToMany.map(r => r.referencingEntity);
    const m2mEntities = relationships.manyToMany.map(r => r.referencedEntity);
    const m2oEntities = relationships.manyToOne.map(r => r.referencedEntity);
    const childEntities = [...new Set([...o2mEntities, ...m2mEntities])];
    const allRelatedEntities = [...new Set([...childEntities, ...m2oEntities])];
    if (allRelatedEntities.length === 0) return;

    const attrSvc = new MetadataService(ctx);

    // Load attr names for child entities (O2M, M2M) used for dropdown labels
    const results = childEntities.length > 0
        ? await Promise.all(childEntities.map(async entity => ({
            entity,
            map: await attrSvc.getAttributeDisplayNameMap(entity)
        })))
        : [];

    // Load display/collection names for all related entities
    const entityNames = await attrSvc.getEntityNamesForList(allRelatedEntities);

    if (cancelToken.cancelled) return;

    if (results.length > 0) {
        setRelatedAttrNames(prev => {
            const next = new Map(prev);
            for (const { entity, map } of results) next.set(entity, map);
            return next;
        });
    }
    if (entityNames.size > 0) {
        setAdditionalCollectionNames(prev => {
            const next = new Map(prev);
            entityNames.forEach((v, k) => next.set(k, v.collectionName));
            return next;
        });
        setAdditionalSingularNames(prev => {
            const next = new Map(prev);
            entityNames.forEach((v, k) => next.set(k, v.singularName));
            return next;
        });
    }
}

export const FetchXMLQueryBuilder: React.FC<FetchXMLQueryBuilderProps> = ({
    entityName,
    metadata,
    isLoading,
    error,
    initialGroup,
    initialLinkEntities,
    initialOrderBy,
    onQueryChange,
    onSaveToField,
    availableEntities = [],
    onEntityChange,
    allowEntityChange = false,
    context // PCF context for lookup picker
}) => {
    const [queryGroup, setQueryGroup] = React.useState<QueryGroup>(
        initialGroup || {
            id: 'root',
            operator: 'and',
            conditions: [],
            groups: []
        }
    );
    
    const [fetchXML, setFetchXML] = React.useState<string>('');
    const [showFetchXML, setShowFetchXML] = React.useState<boolean>(false);
    const [isSaving, setIsSaving] = React.useState<boolean>(false);
    
    // Track if the query has been modified by the user
    const [userModifiedQuery, setUserModifiedQuery] = React.useState<boolean>(false);
    
    // Track selected entity from dropdown
    const [selectedEntityName, setSelectedEntityName] = React.useState<string>(entityName);
    
    // Column selection state
    const [showColumnPicker, setShowColumnPicker] = React.useState<boolean>(false);
    const [selectedColumns, setSelectedColumns] = React.useState<string[]>([]);
    const [tempSelectedColumns, setTempSelectedColumns] = React.useState<string[]>([]);
    
    // Column picker search filter
    const [columnSearchText, setColumnSearchText] = React.useState<string>('');
    
    // Related entities state (link-entity support)
    const [linkEntities, setLinkEntities] = React.useState<LinkEntity[]>([]);
    const [availableRelationships, setAvailableRelationships] = React.useState<RelationshipMetadata[]>([]);
    const [isLoadingRelationships, setIsLoadingRelationships] = React.useState<boolean>(false);
    
    // Order-by clauses for sorting query results
    const [orderBy, setOrderBy] = React.useState<OrderBy[]>(initialOrderBy || []);
    
    // Save-success notification (auto-dismisses after 3 s)
    const [saveNotification, setSaveNotification] = React.useState<'success' | 'error' | null>(null);

    // Sort panel visibility and temp state (Panel pattern like column picker)
    const [showSortPanel, setShowSortPanel] = React.useState<boolean>(false);
    const [tempOrderBy, setTempOrderBy] = React.useState<OrderBy[]>([]);

    // Entity search filter for contains-based type-ahead
    const [entitySearchText, setEntitySearchText] = React.useState<string>('');

    // Ref for entity ComboBox — used to programmatically open dropdown on typing
    const entityComboBoxRef = React.useRef<IComboBox>(null);

    // Preloaded attribute display-name maps for OneToMany child entities
    // (entity logicalName → (attribute logicalName → display name))
    const [relatedAttrNames, setRelatedAttrNames] = React.useState<Map<string, Map<string, string>>>(new Map());
    // DisplayCollectionNames for entities not in the main entities list
    // (e.g. activityparty, bulkoperationlog, externalparty which are IsValidForAdvancedFind=false)
    const [additionalCollectionNames, setAdditionalCollectionNames] = React.useState<Map<string, string>>(new Map());
    // Singular display names for entities not in the main list (for M2O qualifier labels)
    const [additionalSingularNames, setAdditionalSingularNames] = React.useState<Map<string, string>>(new Map());

    // Merged collection names map: platform list + extra child entity names
    const entityCollectionNames = React.useMemo(
        () => {
            const merged = new Map(additionalCollectionNames);
            availableEntities
                .filter(e => e.displayCollectionName)
                .forEach(e => merged.set(e.logicalName, e.displayCollectionName as string));
            return merged;
        },
        [availableEntities, additionalCollectionNames]
    );

    // Entity singular display-name map (logicalName → displayName)
    // Merges the main entity list with additional names loaded for M2O referenced entities
    const entityDisplayNamesMap = React.useMemo(
        () => {
            const merged = new Map(additionalSingularNames);
            availableEntities.forEach(e => merged.set(e.logicalName, e.displayName));
            return merged;
        },
        [availableEntities, additionalSingularNames]
    );
    
    // Apply initialGroup when it's provided from saved FetchXML
    React.useEffect(() => {
        if (initialGroup) {
            setQueryGroup(initialGroup);
            setUserModifiedQuery(false);
        }
    }, [initialGroup]);
    
    // Apply initialLinkEntities when provided from saved FetchXML
    React.useEffect(() => {
        if (initialLinkEntities && initialLinkEntities.length > 0) {
            setLinkEntities(initialLinkEntities);
        }
    }, [initialLinkEntities]);

    // Apply initialOrderBy when provided from saved FetchXML
    React.useEffect(() => {
        if (initialOrderBy && initialOrderBy.length > 0) {
            setOrderBy(initialOrderBy);
        }
    }, [initialOrderBy]);

    // Auto-dismiss the save-success notification after configured timeout
    React.useEffect(() => {
        if (saveNotification === 'success') {
            const timer = globalThis.setTimeout(() => setSaveNotification(null), NOTIFICATION_TIMEOUT_MS);
            return () => globalThis.clearTimeout(timer);
        }
        return undefined;
    }, [saveNotification]);

    /**
     * Build a FetchXML string from the current query state.
     * Extracted to reduce cognitive complexity of the useEffect below.
     */
    const buildFetchXML = React.useCallback((): string => {
        if (!hasQueryContent(queryGroup)) return '';
        const cols = selectedColumns.length > 0 ? selectedColumns : undefined;
        const sort = orderBy.length > 0 ? orderBy : undefined;
        if (linkEntities.length > 0) {
            return FetchXMLGenerator.generateFetchXMLWithLinks(entityName, queryGroup, linkEntities, cols, sort);
        }
        return FetchXMLGenerator.generateFetchXML(entityName, queryGroup, cols, sort);
    }, [queryGroup, entityName, selectedColumns, linkEntities, orderBy]);
    
    // Update FetchXML whenever query changes
    React.useEffect(() => {
        if (!metadata || metadata.attributes.length === 0) return;
        try {
            const xml = buildFetchXML();
            setFetchXML(xml);
            if (userModifiedQuery) {
                onQueryChange(xml, queryGroup);
            }
        } catch (err) {
            console.error('Error generating FetchXML:', err);
        }
    }, [buildFetchXML, metadata, onQueryChange, userModifiedQuery, queryGroup]);
    
    // Reset query when entity changes (only if no initialGroup)
    React.useEffect(() => {
        if (!initialGroup) {
            setQueryGroup({
                id: 'root',
                operator: 'and',
                conditions: [],
                groups: []
            });
            setUserModifiedQuery(false);
            setSelectedColumns([]);  // Clear column selection when entity changes
            setOrderBy([]);          // Clear sort order – attributes belong to the old entity
            setLinkEntities([]);     // Clear related entities – relationships belong to the old entity
            setRelatedAttrNames(new Map()); // Clear cached attr names for old entity's relationships
            setAdditionalCollectionNames(new Map()); // Clear cached collection names
            setAdditionalSingularNames(new Map()); // Clear cached singular names
        }
    }, [entityName]);
    
    // Load relationships when entity changes
    React.useEffect(() => {
        const cancelToken = { cancelled: false };

        const loadRelationships = async (): Promise<void> => {
            if (!entityName) {
                setAvailableRelationships([]);
                return;
            }
            if (!context) {
                setAvailableRelationships([]);
                return;
            }
            
            setIsLoadingRelationships(true);
            try {
                const metadataService = new MetadataService(context);
                const relationships = await metadataService.getAllRelationships(entityName);
                
                // Discard stale results if entity changed while fetching
                if (cancelToken.cancelled) return;
                
                // IsValidForAdvancedFind filtering is already applied in metadataService.
                // No additional client-side filtering needed — show all queryable relationships.
                // This aligns with Modern Advanced Find behavior and avoids undocumented
                // Classic AF filtering rules that vary by environment.
                const allRelationships: RelationshipMetadata[] = [
                    ...relationships.manyToOne,
                    ...relationships.oneToMany,
                    ...relationships.manyToMany
                ];
                
                setAvailableRelationships(allRelationships);

                // Background-load attribute display names AND entity names
                // for entities referenced by relationships.
                loadRelationshipDisplayNames(
                    relationships, context, cancelToken,
                    setRelatedAttrNames, setAdditionalCollectionNames, setAdditionalSingularNames
                );
            } catch (error) {
                if (cancelToken.cancelled) return;
                console.error('[FetchXMLQueryBuilder] Error loading relationships:', error);
                setAvailableRelationships([]);
            } finally {
                if (!cancelToken.cancelled) setIsLoadingRelationships(false);
            }
        };
        
        loadRelationships();
        return () => { cancelToken.cancelled = true; };
}, [entityName, context]);
    
    const handleGroupChange = (updatedGroup: QueryGroup): void => {
        setUserModifiedQuery(true);  // Mark that user has modified the query
        setQueryGroup(updatedGroup);
    };
    
    // Helper function to check if query has any content (conditions or nested groups)
    const hasQueryContent = (group: QueryGroup): boolean => {
        // Check if this group has conditions
        if (group.conditions.length > 0) {
            return true;
        }
        // Recursively check nested groups
        return group.groups.some(nestedGroup => hasQueryContent(nestedGroup));
    };
    
    const copyToClipboard = (): void => {
        // eslint-disable-next-line promise/always-return
        navigator.clipboard.writeText(fetchXML).then(() => {
            // Success - could add a toast notification here if needed
        }).catch(err => {
            console.error('Failed to copy FetchXML to clipboard:', err);
        });
    };
    
    const handleEntityChangeFromDropdown = async (option?: IDropdownOption): Promise<void> => {
        if (!option || !onEntityChange) return;
        const newEntityName = option.key as string;

        // Warn if query has content before clearing it
        if (hasQueryContent(queryGroup)) {
            if (context) {
                // Use native D365 confirm dialog (non-blocking, no modal window)
                const result = await context.navigation.openConfirmDialog(
                    {
                        text: 'Changing the entity will clear your current query. Do you want to continue?',
                        title: 'Change Entity'
                    },
                    { height: 200, width: 450 }
                );
                if (!result.confirmed) return;
            } else {
                // Fallback for test harness / offline environments
                const ok = globalThis.confirm(
                    'Changing the entity will clear your current query. Do you want to continue?'
                );
                if (!ok) return;
            }
        }

        setSelectedEntityName(newEntityName);
        onEntityChange(newEntityName);
    };
    
    // Update selected entity when entityName prop changes
    React.useEffect(() => {
        setSelectedEntityName(entityName);
    }, [entityName]);

    // ── Memoized values (must be above all early returns) ──
    const entityOptions: IComboBoxOption[] = React.useMemo(
        () => {
            const allOptions = availableEntities.map(entity => ({
                key: entity.logicalName,
                text: entity.displayName,
            }));
            if (!entitySearchText) return allOptions;
            const search = entitySearchText.toLowerCase();
            return allOptions.filter(opt => opt.text.toLowerCase().includes(search));
        },
        [availableEntities, entitySearchText]
    );

    const cardStyle = React.useMemo(() => ({
        padding: Sizes.padding,
        backgroundColor: Colors.backgroundCard,
        borderRadius: Sizes.borderRadius,
        boxShadow: CARD_BOX_SHADOW,
    }), []);
    
    if (isLoading) {
        return (
            <Stack horizontalAlign="center" verticalAlign="center" styles={{ root: { padding: 40 } }}>
                <Spinner size={SpinnerSize.large} label="Loading metadata..." />
            </Stack>
        );
    }
    
    if (error) {
        return (
            <MessageBar messageBarType={MessageBarType.error} isMultiline>
                {error}
            </MessageBar>
        );
    }
    
    // When no entity is selected yet, don't block — fall through to render
    // the entity selector dropdown so the user can pick one
    const entityNotSelected = !entityName || entityName.trim() === '';
    
    if (!entityNotSelected && !metadata) {
        return (
            <MessageBar messageBarType={MessageBarType.warning}>
                Loading entity metadata...
            </MessageBar>
        );
    }
    
    if (!entityNotSelected && metadata?.attributes?.length === 0) {
        return (
            <MessageBar messageBarType={MessageBarType.warning}>
                No attributes found for entity: {entityName}
            </MessageBar>
        );
    }
    
    const handleSaveQuery = async (): Promise<void> => {
        if (!onSaveToField) {
            return;
        }
        
        try {
            setIsSaving(true);
            
            // First update the internal state
            onQueryChange(fetchXML, queryGroup);
            
            // Then save directly to the field (this persists to database)
            await onSaveToField();

            // Show auto-dismissing success notification inside the control
            setSaveNotification('success');
            
        } catch (error) {
            // Error handling is done in the index.ts file with form notifications
            console.error('Save failed:', error);
        } finally {
            setIsSaving(false);
        }
    };
    
    // Column picker handlers
    const handleOpenColumnPicker = (): void => {
        setTempSelectedColumns([...selectedColumns]);
        setColumnSearchText('');
        setShowColumnPicker(true);
    };
    
    const handleColumnToggle = (columnName: string, checked?: boolean): void => {
        if (checked) {
            setTempSelectedColumns([...tempSelectedColumns, columnName]);
        } else {
            setTempSelectedColumns(tempSelectedColumns.filter(col => col !== columnName));
        }
    };
    
    const handleSelectAllColumns = (): void => {
        if (metadata) {
            setTempSelectedColumns(metadata.attributes.map(attr => attr.logicalName));
        }
    };
    
    const handleClearAllColumns = (): void => {
        setTempSelectedColumns([]);
    };
    
    const handleApplyColumns = (): void => {
        setSelectedColumns([...tempSelectedColumns]);
        setShowColumnPicker(false);
        setUserModifiedQuery(true); // Mark as modified since columns changed
    };
    
    const handleCancelColumnPicker = (): void => {
        setShowColumnPicker(false);
        setTempSelectedColumns([...selectedColumns]);
    };
    
    // Render footer for column picker panel
    const renderColumnPickerFooter = (): JSX.Element => (
        <PanelFooter onApply={handleApplyColumns} onCancel={handleCancelColumnPicker} />
    );

    // Sort panel handlers
    const handleApplySort = (): void => {
        setOrderBy([...tempOrderBy]);
        setShowSortPanel(false);
        setUserModifiedQuery(true);
    };
    const handleCancelSort = (): void => {
        setShowSortPanel(false);
    };
    // Render footer for sort panel (extracted to satisfy SonarQube — no inline component defs)
    const renderSortPanelFooter = (): JSX.Element => (
        <PanelFooter onApply={handleApplySort} onCancel={handleCancelSort} />
    );

    return (
        <Stack tokens={{ childrenGap: 8 }} styles={{ root: { padding: Sizes.paddingSmall, backgroundColor: Colors.backgroundPage } }}>
            {/* Entity Selector + Action Buttons — single compact row */}
            {allowEntityChange && (
                <Stack
                    horizontal
                    verticalAlign="end"
                    tokens={{ childrenGap: 10 }}
                    styles={{ root: { ...cardStyle, padding: `10px ${Sizes.padding}px`, flexWrap: 'nowrap' } }}
                >
                    {/* Entity selector (left side, fills available space) */}
                    <Stack.Item grow={1} styles={{ root: { minWidth: 200 } }}>
                    <Stack tokens={{ childrenGap: 2 }}>
                        <Label styles={{ root: { fontWeight: 600, fontSize: 12, color: Colors.textSubtle, margin: 0, padding: 0, lineHeight: '16px' } }}>
                            Entity
                        </Label>
                        {availableEntities.length > 0 ? (
                            <ComboBox
                                componentRef={entityComboBoxRef}
                                placeholder="Search entities..."
                                options={entityOptions}
                                selectedKey={selectedEntityName}
                                onChange={(_, option) => {
                                    if (option) {
                                        handleEntityChangeFromDropdown(option as IDropdownOption);
                                        setEntitySearchText('');
                                    }
                                }}
                                onInputValueChange={(text) => {
                                    setEntitySearchText(text || '');
                                    if (text) {
                                        entityComboBoxRef.current?.focus(true);
                                    }
                                }}
                                allowFreeform
                                autoComplete="off"
                                useComboBoxAsMenuWidth
                                styles={{
                                    root: { width: '100%' },
                                    optionsContainer: { maxHeight: Sizes.comboBoxMaxHeight }
                                }}
                                disabled={isLoading}
                                ariaLabel="Select an entity to build a query"
                            />
                        ) : (
                            <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center" styles={{ root: { height: Sizes.buttonHeight } }}>
                                <Spinner size={SpinnerSize.small} />
                                <Text variant="small" styles={{ root: { color: Colors.textSubtle } }}>Loading entities...</Text>
                            </Stack>
                        )}
                    </Stack>
                    </Stack.Item>

                    {/* Thin vertical separator */}
                    <div style={{ width: 1, height: 26, backgroundColor: Colors.borderLight, alignSelf: 'center', margin: '0 4px' }} />

                    {/* Action buttons — aligned right, never wrap */}
                    <Stack.Item shrink={0}>
                    <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center" styles={{ root: { justifyContent: 'flex-end', flexWrap: 'nowrap' } }}>
                        <DefaultButton
                            iconProps={{ iconName: 'Sort' }}
                            text={orderBy.length > 0 ? `Sort (${orderBy.length})` : 'Sort'}
                            onClick={() => {
                                setTempOrderBy([...orderBy]);
                                setShowSortPanel(true);
                            }}
                            disabled={!metadata}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, padding: '0 10px', flexShrink: 0 },
                                icon: { color: Colors.themePrimary, fontSize: 13 },
                                label: { fontSize: 13 },
                            }}
                            title={orderBy.length > 0
                                ? `${orderBy.length} sort clause(s) configured`
                                : 'Configure sort order'}
                        />
                        <DefaultButton
                            iconProps={{ iconName: 'ColumnOptions' }}
                            text="Columns"
                            onClick={handleOpenColumnPicker}
                            disabled={!metadata}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, padding: '0 10px', flexShrink: 0 },
                                icon: { color: Colors.themePrimary, fontSize: 13 },
                                label: { fontSize: 13 },
                            }}
                            title={selectedColumns.length > 0
                                ? `${selectedColumns.length} column(s) selected`
                                : 'Select columns to include'}
                        />
                        <PrimaryButton
                            text={isSaving ? 'Saving...' : 'Save'}
                            iconProps={{ iconName: 'Save' }}
                            onClick={handleSaveQuery}
                            disabled={isSaving || !metadata}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, padding: '0 12px', flexShrink: 0 },
                                icon: { fontSize: 13 },
                                label: { fontSize: 13 },
                            }}
                            title="Save the query"
                        />
                        <DefaultButton
                            text={showFetchXML ? 'Hide XML' : 'FetchXML'}
                            iconProps={{ iconName: 'Code' }}
                            onClick={() => setShowFetchXML(!showFetchXML)}
                            disabled={!metadata}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, padding: '0 10px', flexShrink: 0 },
                                icon: { color: Colors.themeSuccess, fontSize: 13 },
                                label: { fontSize: 13 },
                            }}
                            title={showFetchXML ? 'Hide the FetchXML' : 'Show the FetchXML'}
                        />
                        <DefaultButton
                            text="Reset"
                            iconProps={{ iconName: 'EraseTool' }}
                            onClick={() => {
                                setQueryGroup({ id: 'root', operator: 'and', conditions: [], groups: [] });
                                setOrderBy([]);
                                setSelectedColumns([]);
                                setLinkEntities([]);
                                setShowFetchXML(false);
                                setUserModifiedQuery(true);
                            }}
                            disabled={!metadata}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, padding: '0 10px', flexShrink: 0 },
                                icon: { fontSize: 13, color: Colors.themePrimary },
                                label: { fontSize: 13 },
                            }}
                            title="Reset query — clear all conditions, sorts, columns, and related entities"
                        />
                    </Stack>
                    </Stack.Item>
                </Stack>
            )}

            {/* Prompt when no entity is selected yet */}
            {entityNotSelected && (
                <MessageBar messageBarType={MessageBarType.info}>
                    Select an entity from the dropdown above to start building your query.
                </MessageBar>
            )}

            {/* Save Success Notification (auto-dismisses after 3 s) */}
            {saveNotification === 'success' && (
                <MessageBar
                    messageBarType={MessageBarType.success}
                    onDismiss={() => setSaveNotification(null)}
                    dismissButtonAriaLabel="Close"
                >
                    Query saved successfully!
                </MessageBar>
            )}

            {/* Query Builder Section */}
            {metadata && metadata.attributes.length > 0 && (
                <Stack styles={{ root: cardStyle }}>
                    <QueryGroupComponent
                        group={queryGroup}
                        attributes={metadata.attributes}
                        onGroupChange={handleGroupChange}
                        level={0}
                        context={context}
                    />

                    {/* Related Entities Section */}
                    <Stack tokens={{ childrenGap: 10 }} styles={{ root: { marginTop: 16, paddingTop: 14, borderTop: `1px solid ${Colors.borderLight}` } }}>
                        <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
                            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, fontSize: Sizes.sectionTitleFontSize } }}>
                                Related Entities
                            </Text>
                            <DefaultButton
                                text="Add Related Entity"
                                iconProps={{ iconName: 'Add' }}
                                onClick={() => {
                                    // Add new empty link entity
                                    const newLink: LinkEntity = {
                                        id: `link-${Date.now()}`,
                                        name: '',
                                        from: '',
                                        to: '',
                                        linkType: LinkType.Inner
                                    };
                                    setLinkEntities([...linkEntities, newLink]);
                                }}
                                disabled={isLoadingRelationships || availableRelationships.length === 0}
                                styles={{
                                    root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius },
                                    icon: { fontSize: 12, color: Colors.themePrimary },
                                }}
                            />
                        </Stack>
                        
                        {isLoadingRelationships && (
                            <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                                <Spinner size={SpinnerSize.small} />
                                <Text variant="small">Loading relationships...</Text>
                            </Stack>
                        )}
                        
                        {linkEntities.map((linkEntity, index) => (
                            <RelatedEntitySelector
                                key={linkEntity.id}
                                linkEntity={linkEntity}
                                availableRelationships={availableRelationships}
                                onLinkEntityChange={(updated) => {
                                    const newLinks = [...linkEntities];
                                    newLinks[index] = updated;
                                    setLinkEntities(newLinks);
                                }}
                                onRemove={() => {
                                    setLinkEntities(linkEntities.filter((_, i) => i !== index));
                                }}
                                entityDisplayNames={entityDisplayNamesMap}
                                entityCollectionNames={entityCollectionNames}
                                parentEntityMetadata={metadata}
                                relatedAttributeDisplayNames={relatedAttrNames}
                                context={context}
                            />
                        ))}
                        
                        {!isLoadingRelationships && availableRelationships.length === 0 && (
                            <MessageBar messageBarType={MessageBarType.info}>
                                No relationships found for this entity.
                            </MessageBar>
                        )}
                    </Stack>
                </Stack>
            )}
            
            {/* Show message if entity selected but no metadata */}
            {allowEntityChange && selectedEntityName && !metadata && !isLoading && (
                <MessageBar messageBarType={MessageBarType.warning}>
                    Please wait while loading metadata for {selectedEntityName}...
                </MessageBar>
            )}
            
            {showFetchXML && fetchXML && (
                <Stack 
                    tokens={{ childrenGap: 10 }}
                    styles={{ root: cardStyle }}
                >
                    <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
                        <Label styles={{ root: { fontWeight: 600, fontSize: Sizes.sectionTitleFontSize } }}>
                            Generated FetchXML
                        </Label>
                        <DefaultButton
                            text="Copy"
                            iconProps={{ iconName: 'Copy' }}
                            onClick={copyToClipboard}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius },
                                icon: { color: Colors.themePrimary }
                            }}
                            title="Copy to clipboard"
                        />
                    </Stack>
                    <TextField
                        multiline
                        rows={15}
                        value={fetchXML}
                        readOnly
                        styles={{
                            root: { borderRadius: Sizes.borderRadius, overflow: 'hidden' },
                            fieldGroup: { borderRadius: Sizes.borderRadius },
                            field: {
                                fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
                                fontSize: 12,
                                lineHeight: '1.6',
                                backgroundColor: Colors.backgroundCode,
                                color: Colors.textInverted,
                                padding: 14,
                                borderRadius: Sizes.borderRadius,
                            }
                        }}
                    />
                </Stack>
            )}
            
            {/* Column Picker Panel */}
            <Panel
                isOpen={showColumnPicker}
                onDismiss={handleCancelColumnPicker}
                headerText="Edit Columns"
                type={PanelType.medium}
                isFooterAtBottom={true}
                onRenderFooterContent={renderColumnPickerFooter}
            >
                <Stack tokens={{ childrenGap: 14 }} styles={{ root: { marginTop: 10 } }}>
                    {/* Select All / Clear All buttons */}
                    <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <DefaultButton 
                            text="Select All" 
                            onClick={handleSelectAllColumns}
                            iconProps={{ iconName: 'CheckboxComposite' }}
                            styles={{ root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius } }}
                        />
                        <DefaultButton 
                            text="Clear All" 
                            onClick={handleClearAllColumns}
                            iconProps={{ iconName: 'Clear' }}
                            styles={{ root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius } }}
                        />
                    </Stack>
                    
                    {/* Info message */}
                    <MessageBar messageBarType={MessageBarType.info}>
                        {tempSelectedColumns.length === 0 
                            ? 'No columns selected - all columns will be included by default.'
                            : `${tempSelectedColumns.length} column(s) selected.`}
                    </MessageBar>

                    {/* Search box for filtering columns */}
                    <SearchBox
                        placeholder="Search columns..."
                        value={columnSearchText}
                        onChange={(_, newValue) => setColumnSearchText(newValue || '')}
                        onClear={() => setColumnSearchText('')}
                        styles={{ root: { borderRadius: Sizes.borderRadius } }}
                    />
                    
                    {/* Scrollable list of checkboxes */}
                    <Stack styles={{ root: { maxHeight: Sizes.columnPickerMaxHeight, overflowY: 'auto', paddingRight: 10 } }}>
                        {metadata?.attributes
                            .filter(attr => {
                                if (!columnSearchText) return true;
                                const search = columnSearchText.toLowerCase();
                                return attr.displayName.toLowerCase().includes(search) ||
                                       attr.logicalName.toLowerCase().includes(search);
                            })
                            .map(attr => (
                            <Checkbox
                                key={attr.logicalName}
                                label={`${attr.displayName} (${attr.logicalName})`}
                                checked={tempSelectedColumns.includes(attr.logicalName)}
                                onChange={(_, checked) => handleColumnToggle(attr.logicalName, checked)}
                                styles={{
                                    root: {
                                        marginBottom: 4,
                                        padding: '4px 6px',
                                        borderRadius: 4,
                                        selectors: { ':hover': { backgroundColor: Colors.backgroundHover } },
                                    },
                                }}
                            />
                        ))}
                    </Stack>
                </Stack>
            </Panel>

            {/* Sort Order Panel */}
            <Panel
                isOpen={showSortPanel}
                onDismiss={() => setShowSortPanel(false)}
                headerText="Sort Order"
                type={PanelType.smallFixedFar}
                isFooterAtBottom={true}
                onRenderFooterContent={renderSortPanelFooter}
            >
                <Stack tokens={{ childrenGap: 14 }} styles={{ root: { marginTop: 10 } }}>
                    <MessageBar messageBarType={MessageBarType.info}>
                        {tempOrderBy.length === 0
                            ? 'No sort configured — results will use default order.'
                            : `${tempOrderBy.length} sort clause(s) configured. Max 2 allowed.`}
                    </MessageBar>

                    {tempOrderBy.length < 2 && (
                        <DefaultButton
                            text="Add Sort"
                            iconProps={{ iconName: 'Add' }}
                            onClick={() => {
                                const firstAttr = metadata?.attributes[0];
                                if (firstAttr) {
                                    setTempOrderBy([...tempOrderBy, { attribute: firstAttr.logicalName, descending: false }]);
                                }
                            }}
                            disabled={!metadata}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, alignSelf: 'flex-start' },
                                icon: { fontSize: 12, color: Colors.themePrimary },
                            }}
                        />
                    )}

                    {tempOrderBy.map((order, index) => (
                        <Stack
                            key={`sort-${order.attribute}-${order.descending ? 'desc' : 'asc'}-${index}`}
                            tokens={{ childrenGap: 8 }}
                            styles={{
                                root: {
                                    padding: 12,
                                    backgroundColor: Colors.backgroundSection,
                                    borderRadius: Sizes.borderRadius,
                                    borderLeft: `${Sizes.accentBarWidth}px solid ${Colors.borderAccent}`,
                                }
                            }}
                        >
                            <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
                                <Text variant="small" styles={{ root: { fontWeight: 600, color: Colors.textSubtle } }}>
                                    Sort {index + 1}
                                </Text>
                                <IconButton
                                    iconProps={{ iconName: 'Cancel' }}
                                    title="Remove sort"
                                    ariaLabel="Remove sort"
                                    onClick={() => {
                                        setTempOrderBy(tempOrderBy.filter((_, i) => i !== index));
                                    }}
                                    styles={{
                                        root: { width: 24, height: 24, color: Colors.textSubtle },
                                        rootHovered: { color: '#a80000' },
                                    }}
                                />
                            </Stack>
                            <Dropdown
                                label="Attribute"
                                options={metadata?.attributes.map(attr => ({
                                    key: attr.logicalName,
                                    text: `${attr.displayName} (${attr.logicalName})`
                                })) || []}
                                selectedKey={order.attribute}
                                onChange={(_, opt) => {
                                    if (opt) {
                                        const updated = [...tempOrderBy];
                                        updated[index] = { ...order, attribute: opt.key as string };
                                        setTempOrderBy(updated);
                                    }
                                }}
                                styles={{ root: { width: '100%' } }}
                            />
                            <Dropdown
                                label="Direction"
                                options={[
                                    { key: 'asc', text: 'Ascending' },
                                    { key: 'desc', text: 'Descending' }
                                ]}
                                selectedKey={order.descending ? 'desc' : 'asc'}
                                onChange={(_, opt) => {
                                    if (opt) {
                                        const updated = [...tempOrderBy];
                                        updated[index] = { ...order, descending: opt.key === 'desc' };
                                        setTempOrderBy(updated);
                                    }
                                }}
                                styles={{ root: { width: '100%' } }}
                            />
                        </Stack>
                    ))}

                    {tempOrderBy.length > 0 && (
                        <DefaultButton
                            text="Clear All"
                            iconProps={{ iconName: 'Clear' }}
                            onClick={() => setTempOrderBy([])}
                            styles={{
                                root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, alignSelf: 'flex-start' },
                            }}
                        />
                    )}
                </Stack>
            </Panel>
        </Stack>
    );
};

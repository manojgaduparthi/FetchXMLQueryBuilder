/**
 * Related Entity Selector Component
 *
 * @description React component for selecting and configuring related entities (link-entity)
 *
 * This component allows users to add related entities to their query.
 * Shows relationships with descriptive labels to clearly distinguish
 * multiple lookups to the same entity.
 */

import * as React from 'react';
import {
    ComboBox,
    IComboBox,
    IComboBoxOption,
    IconButton,
    Stack,
    Text,
    DefaultButton,
    Spinner,
    SpinnerSize
} from '@fluentui/react';
import { LinkEntity, LinkType, RelationshipMetadata, EntityMetadata, QueryGroup } from '../types';
import { QueryGroupComponent } from './QueryGroupComponent';
import { MetadataService } from '../services/metadataService';
import { Colors, Sizes } from '../constants';

interface RelatedEntitySelectorProps {
    linkEntity?: LinkEntity;
    availableRelationships: RelationshipMetadata[];
    onLinkEntityChange: (linkEntity: LinkEntity) => void;
    onRemove: () => void;
    entityDisplayNames?: Map<string, string>;            // entity logicalName → singular displayName
    entityCollectionNames?: Map<string, string>;         // entity logicalName → plural displayCollectionName
    parentEntityMetadata?: EntityMetadata | null;        // parent entity metadata (for ManyToOne attr names)
    relatedAttributeDisplayNames?: Map<string, Map<string, string>>; // child entity → (attr → displayName)
    relatedEntityMetadata?: EntityMetadata | null;       // Metadata for the related entity to show conditions
    context?: ComponentFramework.Context<unknown>;       // PCF context for lookup picker
}

export const RelatedEntitySelector: React.FC<RelatedEntitySelectorProps> = React.memo(({
    linkEntity,
    availableRelationships,
    onLinkEntityChange,
    onRemove,
    entityDisplayNames = new Map(),
    entityCollectionNames = new Map(),
    parentEntityMetadata,
    relatedAttributeDisplayNames,
    relatedEntityMetadata,
    context
}) => {
    // Show filter conditions panel expanded by default when there are existing conditions
    const [showFilters, setShowFilters] = React.useState(
        () => {
            const conds = linkEntity?.filters?.conditions.length ?? 0;
            const groups = linkEntity?.filters?.groups.length ?? 0;
            return (conds > 0) || (groups > 0);
        }
    );
    // Metadata for the selected related entity (to drive filter condition fields)
    const [localRelatedMetadata, setLocalRelatedMetadata] = React.useState<EntityMetadata | null>(null);
    const [isLoadingMetadata, setIsLoadingMetadata] = React.useState(false);

    // Prefer explicitly passed relatedEntityMetadata; fall back to locally loaded metadata
    const effectiveMetadata = relatedEntityMetadata === undefined ? localRelatedMetadata : relatedEntityMetadata;

    // Load related entity metadata when the linked entity name changes
    React.useEffect(() => {
        if (!linkEntity?.name || !context) {
            setLocalRelatedMetadata(null);
            return;
        }
        // If the parent already provides the metadata prop, don't fetch again
        if (relatedEntityMetadata !== undefined) {
            return;
        }
        let cancelled = false;
        setIsLoadingMetadata(true);
        const loadMeta = async (): Promise<void> => {
            try {
                const svc = new MetadataService(context);
                const meta = await svc.getEntityMetadata(linkEntity.name);
                if (!cancelled) {
                    setLocalRelatedMetadata(meta);
                    setIsLoadingMetadata(false);
                }
            } catch {
                if (!cancelled) setIsLoadingMetadata(false);
            }
        };
        loadMeta();
        return () => { cancelled = true; };
    }, [linkEntity?.name, context, relatedEntityMetadata]);

    // Auto-expand filter panel when conditions are added externally (e.g., restored from saved FetchXML).
    // Watch the counts rather than the object reference to avoid firing on every parent render.
    const filterCondCount = linkEntity?.filters?.conditions.length ?? 0;
    const filterGroupCount = linkEntity?.filters?.groups.length ?? 0;
    React.useEffect(() => {
        if (filterCondCount > 0 || filterGroupCount > 0) {
            setShowFilters(true);
        }
    }, [filterCondCount, filterGroupCount]);
    
    // Search filter for contains-based type-ahead in relationship ComboBox
    const [relationshipSearchText, setRelationshipSearchText] = React.useState<string>('');

    // Ref for relationship ComboBox — used to programmatically open dropdown on typing
    const relationshipComboBoxRef = React.useRef<IComboBox>(null);

    // Fallback formatter: converts D365 attribute logical names to readable text.
    // Strips objectid/id suffixes and publisher prefixes, then capitalises words.
    const formatAttrFallback = (logicalName: string): string => {
        let s = logicalName
            .replace(/objectid$/i, '')   // regardingobjectid → regarding
            .replace(/id$/i, '');         // parentaccountid → parentaccount (best effort)
        s = s.replace(/^(msdyn_|mscrm_|new_|cr\d+_)/i, '');
        // Split on underscores; camelCase splitting skipped because D365 logical names are all lowercase
        return s.split('_')
            .filter(Boolean)
            .map(p => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ');
    };

    // Fallback formatter: converts a D365 entity logical name to a readable entity name.
    const formatEntityFallback = (logicalName: string): string => {
        const s = logicalName.replace(/^(msdyn_|mscrm_|new_|cr\d+_)/i, '');
        return s.split('_')
            .filter(Boolean)
            .map(p => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ');
    };

    /**
     * Get the attribute display name to use in the qualifier "(attr)".
     * - ManyToOne: attribute lives on the PARENT entity — look it up from parentEntityMetadata
     * - OneToMany: attribute lives on the CHILD entity — use pre-loaded relatedAttributeDisplayNames map
     * - Fallback: derive from logical name
     */
    const getAttrDisplayName = (rel: RelationshipMetadata): string => {
        if (rel.relationshipType === 'ManyToOne') {
            const attr = parentEntityMetadata?.attributes.find(
                a => a.logicalName === rel.referencingAttribute
            );
            if (attr) return attr.displayName;
        } else {
            const childMap = relatedAttributeDisplayNames?.get(rel.referencingEntity);
            const dn = childMap?.get(rel.referencingAttribute);
            if (dn) return dn;
        }
        return formatAttrFallback(rel.referencingAttribute);
    };

    /**
     * Get the entity PLURAL (collection) name for OneToMany/ManyToMany relationships.
     */
    const getEntityCollectionLabel = (entityLogicalName: string): string => {
        const collRaw = entityCollectionNames.get(entityLogicalName);
        if (collRaw) return collRaw;
        const displayRaw = entityDisplayNames.get(entityLogicalName);
        if (displayRaw) return displayRaw;
        return formatEntityFallback(entityLogicalName);
    };

    /**
     * Get the entity SINGULAR display name for ManyToOne relationships.
     */
    const getEntitySingularLabel = (entityLogicalName: string): string => {
        const raw = entityDisplayNames.get(entityLogicalName);
        if (raw) return raw;
        return formatEntityFallback(entityLogicalName);
    };

    // Build relationship dropdown options matching OOB Advanced Find exactly.
    //
    // OOB Advanced Find format by relationship type:
    //   UseLabel (any type) -> bare custom label, e.g. "Account team members"
    //   OneToMany  -> "ChildEntityCollectionName (ChildAttrDisplayName)"
    //                  e.g. "Accounts (Parent Account)", "Cases (Customer)"
    //   ManyToOne  -> "AttrDisplayName (ReferencedEntitySingularName)"
    //                  e.g. "Created By (User)", "Primary Contact (Contact)"
    //   ManyToMany -> "OtherEntityCollectionName" (bare)
    //                  e.g. "Accepted Lead Types"
    //
    // NOTE: AssociatedMenuConfiguration.Behavior (UseCollectionName / DoNotDisplay)
    // controls the entity NAVIGATION MENU, NOT Advanced Find labelling.
    // The only Behavior value Advanced Find uses is UseLabel (for custom text).
    // The only valid filter is IsValidForAdvancedFind=false (in metadataService).

    const relationshipOptions: IComboBoxOption[] = availableRelationships.map(rel => {
        const behavior = rel.associatedMenuConfiguration?.Behavior;
        const customLabel = rel.associatedMenuConfiguration?.Label?.UserLocalizedLabel?.Label;

        let displayText: string;

        if (behavior === 'UseLabel' && customLabel) {
            // Publisher-supplied custom label shown as-is, no qualifier.
            displayText = customLabel;

        } else if (rel.relationshipType === 'ManyToOne') {
            // ManyToOne: "AttributeDisplayName (EntitySingularName)"
            const attrLabel = getAttrDisplayName(rel);
            const entitySingular = getEntitySingularLabel(rel.referencedEntity);
            // Skip redundant qualifier when attr name matches entity name
            // e.g. "Currency" attr + "Currency" entity = just "Currency"
            if (attrLabel.toLowerCase() === entitySingular.toLowerCase()) {
                displayText = attrLabel;
            } else {
                displayText = `${attrLabel} (${entitySingular})`;
            }

        } else if (rel.relationshipType === 'ManyToMany') {
            // ManyToMany: use the other entity collection name (bare, no qualifier).
            const otherEntity = rel.referencedEntity;
            displayText = getEntityCollectionLabel(otherEntity);

        } else {
            // OneToMany: "ChildEntityCollectionName (ChildAttrDisplayName)"
            const entityLabel = getEntityCollectionLabel(rel.referencingEntity);
            const attrLabel = getAttrDisplayName(rel);
            displayText = `${entityLabel} (${attrLabel})`;
        }

        return { key: rel.schemaName, text: displayText, data: rel };
    }).sort((a, b) => a.text.localeCompare(b.text))
    // Deduplicate: multiple M2M relationships to the same entity produce
    // identical display text (e.g. three "Contacts" entries). OOB shows
    // only one. Keep the first occurrence of each display text.
    .filter((opt, idx, arr) => arr.findIndex(o => o.text === opt.text) === idx)
    // Apply contains-based search filter
    .filter(opt => {
        if (!relationshipSearchText) return true;
        return opt.text.toLowerCase().includes(relationshipSearchText.toLowerCase());
    });

    const handleRelationshipChange = (_event: React.FormEvent<unknown>, option?: IComboBoxOption) => {
        if (!option) return;
        
        const relationship = option.data as RelationshipMetadata;
        
        const newLinkEntity: LinkEntity = {
            id: linkEntity?.id || `link-${Date.now()}`,
            name: relationship.relationshipType === 'ManyToOne' 
                ? relationship.referencedEntity 
                : relationship.referencingEntity,
            from: relationship.relationshipType === 'ManyToOne'
                ? relationship.referencedAttribute
                : relationship.referencingAttribute,
            to: relationship.relationshipType === 'ManyToOne'
                ? relationship.referencingAttribute
                : relationship.referencedAttribute,
            linkType: LinkType.Inner, // Matches Advanced Find / Modern grid filter behavior
            relationship: relationship,
            intersect: relationship.relationshipType === 'ManyToMany',
            attributes: [],
            linkEntities: [],
            filters: linkEntity?.filters || {
                id: `filter-${Date.now()}`,
                operator: 'and',
                conditions: [],
                groups: []
            }
        };
        
        onLinkEntityChange(newLinkEntity);
    };

    return (
        <Stack 
            tokens={{ childrenGap: 10 }} 
            styles={{ 
                root: { 
                    padding: Sizes.paddingSmall, 
                    backgroundColor: Colors.backgroundSection,
                    borderRadius: Sizes.borderRadius,
                    borderLeft: `${Sizes.accentBarWidth}px solid ${Colors.borderAccent}`,
                    marginBottom: 8,
                } 
            }}
        >
            {/* Header: Dropdown and Remove button */}
            <Stack horizontal tokens={{ childrenGap: 10 }} verticalAlign="end">
                <Stack.Item grow={1}>
                    <Stack tokens={{ childrenGap: 6 }}>
                        <Text variant="small" styles={{ root: { fontWeight: 600, fontSize: Sizes.sectionTitleFontSize, color: Colors.textDefault } }}>
                            Related Entity
                        </Text>
                        <ComboBox
                            componentRef={relationshipComboBoxRef}
                            placeholder="Search related entities..."
                            options={relationshipOptions}
                            selectedKey={linkEntity?.relationship?.schemaName}
                            onChange={(ev, option) => {
                                handleRelationshipChange(ev, option);
                                setRelationshipSearchText('');
                            }}
                            onInputValueChange={(text) => {
                                setRelationshipSearchText(text || '');
                                if (text) {
                                    relationshipComboBoxRef.current?.focus(true);
                                }
                            }}
                            allowFreeform
                            autoComplete="off"
                            useComboBoxAsMenuWidth
                            styles={{ root: { width: '100%' }, optionsContainer: { maxHeight: Sizes.comboBoxMaxHeight } }}
                            ariaLabel="Select a related entity to join"
                        />
                    </Stack>
                </Stack.Item>

                <Stack.Item align="end">
                    <IconButton
                        iconProps={{ iconName: 'Cancel' }}
                        title="Remove related entity"
                        ariaLabel="Remove"
                        onClick={onRemove}
                        styles={{
                            root: { marginTop: 20, width: 28, height: 28, color: Colors.textSubtle },
                            rootHovered: { color: '#a80000', backgroundColor: 'transparent' },
                        }}
                    />
                </Stack.Item>
            </Stack>

            {/* Filter Conditions for the Related Entity */}
            {linkEntity?.relationship && (
                <Stack tokens={{ childrenGap: 6 }}>
                    <DefaultButton
                        iconProps={{ iconName: showFilters ? 'ChevronUpSmall' : 'ChevronDownSmall' }}
                        text={showFilters ? 'Hide Filter Conditions' : 'Add Filter Conditions'}
                        onClick={() => setShowFilters(f => !f)}
                        styles={{
                            root: { alignSelf: 'flex-start', height: Sizes.buttonHeightCompact, padding: '0 10px', borderRadius: Sizes.borderRadius },
                            icon: { fontSize: 10 },
                        }}
                    />
                    {showFilters && (
                        <Stack
                            styles={{ root: { paddingLeft: 12, borderLeft: `2px solid ${Colors.borderAccent}`, paddingTop: 8 } }}
                            tokens={{ childrenGap: 8 }}
                        >
                            {isLoadingMetadata && (
                                <Stack horizontal tokens={{ childrenGap: 6 }} verticalAlign="center">
                                    <Spinner size={SpinnerSize.small} />
                                    <Text variant="small">Loading related entity fields...</Text>
                                </Stack>
                            )}
                            {!isLoadingMetadata && effectiveMetadata && (
                                <QueryGroupComponent
                                    group={linkEntity.filters ?? {
                                        id: `filter-link-${linkEntity.id}`,
                                        operator: 'and',
                                        conditions: [],
                                        groups: []
                                    }}
                                    attributes={effectiveMetadata.attributes}
                                    onGroupChange={(updatedFilters: QueryGroup) => {
                                        onLinkEntityChange({ ...linkEntity, filters: updatedFilters });
                                    }}
                                    level={1}
                                    context={context}
                                />
                            )}
                            {!isLoadingMetadata && !effectiveMetadata && (
                                <Text variant="small" styles={{ root: { color: Colors.textSubtle } }}>
                                    Unable to load fields for this related entity.
                                </Text>
                            )}
                        </Stack>
                    )}
                </Stack>
            )}
        </Stack>
    );
});

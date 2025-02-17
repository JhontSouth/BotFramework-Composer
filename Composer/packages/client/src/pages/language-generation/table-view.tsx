// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** @jsx jsx */
import { jsx } from '@emotion/react';
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import isEmpty from 'lodash/isEmpty';
import { DetailsList, DetailsListLayoutMode, SelectionMode, IColumn } from '@fluentui/react/lib/DetailsList';
import { ActionButton } from '@fluentui/react/lib/Button';
import { IconButton } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { ScrollablePane, ScrollbarVisibility } from '@fluentui/react/lib/ScrollablePane';
import { Sticky, StickyPositionType } from '@fluentui/react/lib/Sticky';
import formatMessage from 'format-message';
import { NeutralColors, FontSizes } from '@fluentui/theme';
import { RouteComponentProps } from '@reach/router';
import { LgTemplate } from '@bfc/shared';
import { useRecoilState, useRecoilValue } from 'recoil';
import { lgUtil } from '@bfc/indexers';
import { LgFile } from '@botframework-composer/types/src';

import { EditableField } from '../../components/EditableField';
import { navigateTo } from '../../utils/navigation';
import { actionButton, editableFieldContainer } from '../language-understanding/styles';
import { dispatcherState, localeState, settingsState, dialogsSelectorFamily, lgFileState } from '../../recoilModel';
import { languageListTemplates } from '../../components/MultiLanguage';
import TelemetryClient from '../../telemetry/TelemetryClient';
import { lgFilesSelectorFamily } from '../../recoilModel/selectors/lg';
import { CellFocusZone } from '../../components/CellFocusZone';
import lgWorker from '../../recoilModel/parsers/lgWorker';

interface TableViewProps extends RouteComponentProps<{ dialogId: string; skillId: string; projectId: string }> {
  projectId: string;
  skillId?: string;
  dialogId?: string;
  lgFileId?: string;
  file?: LgFile;
}

const TableView: React.FC<TableViewProps> = (props) => {
  const { dialogId, projectId, skillId, lgFileId, file } = props;

  const actualProjectId = skillId ?? projectId;

  const lgFiles = useRecoilValue(lgFilesSelectorFamily(actualProjectId));
  const locale = useRecoilValue(localeState(actualProjectId));
  const settings = useRecoilValue(settingsState(actualProjectId));
  const dialogs = useRecoilValue(dialogsSelectorFamily(actualProjectId));
  const { createLgTemplate, copyLgTemplate, removeLgTemplate, setMessage, updateLgTemplate } = useRecoilValue(
    dispatcherState
  );

  const { languages, defaultLanguage } = settings;
  const [defaultLg, setDefaultLg] = useRecoilState(
    lgFileState({ projectId: actualProjectId, lgFileId: `${dialogId}.${defaultLanguage}` })
  );

  const getDefaultLangFile = () => {
    let lgFile: LgFile | undefined;
    if (lgFileId) {
      lgFile = lgFiles.find(({ id }) => id === lgFileId);
    } else {
      lgFile = lgFiles.find(({ id }) => id === `${dialogId}.${defaultLanguage}`);
    }
    if (lgFile?.isContentUnparsed) {
      lgWorker.parse(actualProjectId, defaultLg.id, defaultLg.content, lgFiles).then((result) => {
        setDefaultLg(result as LgFile);
        return defaultLg;
      });
    }
    return lgFile;
  };

  const defaultLangFile = getDefaultLangFile();

  const [templates, setTemplates] = useState<LgTemplate[]>([]);
  const listRef = useRef(null);

  const activeDialog = dialogs.find(({ id }) => id === dialogId);

  useEffect(() => {
    if (!file || isEmpty(file)) return;

    setTemplates(file.templates);
  }, [file, activeDialog, actualProjectId]);

  const moreLabel = formatMessage('Actions');

  const onClickEdit = useCallback(
    (name: string) => {
      const baseURL = skillId == null ? `/bot/${projectId}/` : `/bot/${projectId}/skill/${skillId}/`;
      navigateTo(`${baseURL}language-generation/${dialogId}/edit?t=${encodeURIComponent(name)}`);
    },
    [dialogId, projectId, skillId]
  );

  const onCreateNewTemplate = useCallback(() => {
    if (file) {
      const newName = lgUtil.increaseNameUtilNotExist(file.templates, 'TemplateName');
      const payload = {
        projectId: actualProjectId,
        id: file.id,
        template: {
          name: newName,
          body: '-TemplateValue',
        } as LgTemplate,
      };
      createLgTemplate(payload);
    }
  }, [file, actualProjectId]);

  const onRemoveTemplate = useCallback(
    (name) => {
      if (file) {
        const payload = {
          id: file.id,
          templateName: name,
          projectId: actualProjectId,
        };
        removeLgTemplate(payload);
      }
    },
    [file, actualProjectId]
  );

  const onCopyTemplate = useCallback(
    (name) => {
      if (file) {
        const resolvedName = lgUtil.increaseNameUtilNotExist(file.templates, `${name}_Copy`);
        const payload = {
          id: file.id,
          fromTemplateName: name,
          toTemplateName: resolvedName,
          projectId: actualProjectId,
        };
        copyLgTemplate(payload);
      }
    },
    [file, actualProjectId]
  );

  const handleTemplateUpdate = useCallback(
    (templateName: string, template: LgTemplate) => {
      if (file) {
        const payload = {
          id: file.id,
          templateName,
          template,
          projectId: actualProjectId,
        };
        updateLgTemplate(payload);
      }
    },
    [file, actualProjectId]
  );

  const handleTemplateUpdateDefaultLocale = useCallback(
    (templateName: string, template: LgTemplate) => {
      if (defaultLangFile) {
        const payload = {
          id: defaultLangFile.id,
          templateName,
          template,
          projectId: actualProjectId,
        };
        updateLgTemplate(payload);
      }
    },
    [defaultLangFile, actualProjectId]
  );

  const getTemplatesMoreButtons = useCallback(
    (item) => {
      const buttons = [
        {
          key: 'edit',
          name: formatMessage('Edit'),
          onClick: () => {
            onClickEdit(item.name);
          },
        },
        {
          key: 'delete',
          name: formatMessage('Delete'),
          onClick: () => {
            setMessage('item deleted');
            onRemoveTemplate(item.name);
          },
        },
        {
          key: 'copy',
          name: formatMessage('Make a copy'),
          onClick: () => {
            setMessage('item copied');
            onCopyTemplate(item.name);
          },
        },
      ];

      return buttons;
    },
    [activeDialog, templates, onClickEdit, onRemoveTemplate, onCopyTemplate, setMessage]
  );

  const getTableColums = useCallback((): IColumn[] => {
    const languagesList = languageListTemplates(languages, locale, defaultLanguage);
    const defaultLangTeamplate = languagesList.find((item) => item.locale === defaultLanguage);
    const currentLangTeamplate = languagesList.find((item) => item.locale === locale);
    // eslint-disable-next-line format-message/literal-pattern
    const currentLangResponsesHeader = formatMessage(`Responses - ${currentLangTeamplate?.language}`);
    // eslint-disable-next-line format-message/literal-pattern
    const defaultLangResponsesHeader = formatMessage(`Responses - ${defaultLangTeamplate?.language} (default)`);

    let tableColums = [
      {
        key: 'name',
        name: formatMessage('Name'),
        fieldName: 'name',
        minWidth: 100,
        maxWidth: 200,
        isResizable: true,
        data: 'string',
        onRender: (item) => {
          const displayName = `#${item.name}`;
          return (
            <CellFocusZone>
              <EditableField
                ariaLabel={formatMessage(`Name is {name}`, { name: displayName })}
                containerStyles={editableFieldContainer}
                depth={0}
                id={displayName}
                name={displayName}
                value={displayName}
                onBlur={(_id, value) => {
                  const newValue = value?.trim().replace(/^#/, '');
                  if (newValue === item.name) return;
                  if (newValue) {
                    handleTemplateUpdate(item.name, { ...item, name: newValue });
                  }
                }}
                onChange={() => {}}
              />
            </CellFocusZone>
          );
        },
      },
      {
        key: 'responses',
        name: formatMessage('Responses'),
        fieldName: 'responses',
        minWidth: 500,
        isResizable: true,
        data: 'string',
        onRender: (item) => {
          const text = item.body;
          return (
            <CellFocusZone>
              <EditableField
                multiline
                ariaLabel={formatMessage(`Response is {response}`, { response: text })}
                containerStyles={editableFieldContainer}
                depth={0}
                id={text}
                name={text}
                value={text}
                onBlur={(_id, value) => {
                  if (value === item.body) return;
                  const newValue = value?.trim();
                  if (newValue) {
                    // prefix with - to body
                    const fixedBody =
                      !newValue.startsWith('-') && !newValue.startsWith('[') ? `- ${newValue}` : newValue;
                    handleTemplateUpdate(item.name, { ...item, body: fixedBody });
                  }
                }}
                onChange={() => {}}
              />
            </CellFocusZone>
          );
        },
      },
      {
        key: 'responses-lang',
        name: currentLangResponsesHeader,
        fieldName: 'responses',
        minWidth: 300,
        maxWidth: 500,
        isResizable: true,
        data: 'string',
        onRender: (item) => {
          const text = item.body;
          return (
            <CellFocusZone>
              <EditableField
                multiline
                ariaLabel={formatMessage(`Response is {response}`, { response: text })}
                containerStyles={editableFieldContainer}
                depth={0}
                id={text}
                name={text}
                value={text}
                onBlur={(_id, value) => {
                  if (value === item.body) return;
                  const newValue = value?.trim();
                  if (newValue) {
                    // prefix with - to body
                    const fixedBody =
                      !newValue.startsWith('-') && !newValue.startsWith('[') ? `- ${newValue}` : newValue;
                    handleTemplateUpdate(item.name, { ...item, body: fixedBody });
                  }
                }}
                onChange={() => {}}
              />
            </CellFocusZone>
          );
        },
      },
      {
        key: 'responses-default-lang',
        name: defaultLangResponsesHeader,
        fieldName: 'responses-default-lang',
        minWidth: 300,
        isResizable: true,
        data: 'string',
        onRender: (item) => {
          const text = item[`body-${defaultLanguage}`];
          return (
            <CellFocusZone>
              <EditableField
                multiline
                ariaLabel={formatMessage(`Response is {response}`, { response: text })}
                containerStyles={editableFieldContainer}
                depth={0}
                id={text}
                name={text}
                value={text}
                onBlur={(_id, value) => {
                  if (value === item.body) return;
                  const newValue = value?.trim();
                  if (newValue) {
                    // prefix with - to body
                    const fixedBody =
                      !newValue.startsWith('-') && !newValue.startsWith('[') ? `- ${newValue}` : newValue;
                    handleTemplateUpdateDefaultLocale(item.name, { ...item, body: fixedBody });
                  }
                }}
                onChange={() => {}}
              />
            </CellFocusZone>
          );
        },
      },
      {
        key: 'beenUsed',
        name: formatMessage('Been used'),
        fieldName: 'beenUsed',
        minWidth: 100,
        maxWidth: 100,
        isResizable: true,
        isCollapsable: true,
        data: 'string',
        onRender: (item) => {
          return activeDialog?.lgTemplates.find(({ name }) => name === item.name) ? (
            <Icon
              ariaLabel={formatMessage('Used') + ';'}
              iconName={'Accept'}
              styles={{
                root: {
                  fontSize: '16px',
                  paddingTop: '8px',
                },
              }}
            />
          ) : (
            <div data-is-focusable aria-label={formatMessage('Unused') + ';'} />
          );
        },
      },
      {
        key: 'buttons',
        name: '',
        minWidth: 50,
        maxWidth: 50,
        fieldName: 'buttons',
        data: 'string',
        onRender: (item) => {
          return (
            <TooltipHost calloutProps={{ gapSpace: 10 }} content={moreLabel}>
              <IconButton
                ariaLabel={moreLabel}
                menuIconProps={{ iconName: 'MoreVertical' }}
                menuProps={{
                  shouldFocusOnMount: true,
                  items: getTemplatesMoreButtons(item),
                }}
                styles={{ menuIcon: { color: NeutralColors.black, fontSize: FontSizes.size16 } }}
              />
            </TooltipHost>
          );
        },
      },
    ];

    // show compairable column when current lang is not default lang
    if (locale === defaultLanguage) {
      tableColums = tableColums.filter(
        ({ key }) => ['responses-default-lang', 'responses-lang'].includes(key) === false
      );
    } else {
      tableColums = tableColums.filter(({ key }) => ['responses'].includes(key) === false);
    }
    // when is not common, show beenUsed column
    if (!activeDialog) {
      tableColums = tableColums.filter(({ key }) => ['beenUsed'].includes(key) === false);
    }

    return tableColums;
  }, [
    languages,
    locale,
    defaultLanguage,
    handleTemplateUpdate,
    handleTemplateUpdateDefaultLocale,
    getTemplatesMoreButtons,
    activeDialog,
    actualProjectId,
  ]);

  const onRenderDetailsHeader = useCallback((props, defaultRender) => {
    return (
      <div data-testid="tableHeader">
        <Sticky isScrollSynced stickyPosition={StickyPositionType.Header}>
          {defaultRender({
            ...props,
            onRenderColumnHeaderTooltip: (tooltipHostProps) => <TooltipHost {...tooltipHostProps} />,
          })}
        </Sticky>
      </div>
    );
  }, []);

  const onRenderDetailsFooter = useCallback(() => {
    return (
      <div data-testid="tableFooter">
        <ActionButton
          css={actionButton}
          iconProps={{ iconName: 'CirclePlus' }}
          onClick={() => {
            onCreateNewTemplate();
            setMessage(formatMessage('item added'));
            TelemetryClient.track('NewTemplateAdded');
          }}
        >
          {formatMessage('New template')}
        </ActionButton>
      </div>
    );
  }, [activeDialog, templates]);

  const getKeyCallback = useCallback((item) => item.name, []);

  const templatesToRender = useMemo(() => {
    if (locale !== defaultLanguage) {
      return templates.map((item) => {
        const itemInDefaultLang = defaultLangFile?.templates?.find(({ name }) => name === item.name);
        return {
          ...item,
          [`body-${defaultLanguage}`]: itemInDefaultLang?.body || '',
        };
      });
    }
    return templates;
  }, [templates, defaultLangFile, locale, defaultLanguage]);

  return (
    <div className={'table-view'} data-testid={'table-view'}>
      <ScrollablePane scrollbarVisibility={ScrollbarVisibility.auto}>
        <DetailsList
          className="table-view-list"
          columns={getTableColums()}
          componentRef={listRef}
          getKey={getKeyCallback}
          //initialFocusedIndex={focusedIndex}
          items={templatesToRender}
          // getKey={item => item.name}
          layoutMode={DetailsListLayoutMode.justified}
          selectionMode={SelectionMode.none}
          styles={{
            root: {
              overflowX: 'hidden',
              // hack for https://github.com/OfficeDev/office-ui-fabric-react/issues/8783
              selectors: {
                'div[role="row"]:hover': {
                  background: 'none',
                },
              },
            },
          }}
          onRenderDetailsFooter={onRenderDetailsFooter}
          onRenderDetailsHeader={onRenderDetailsHeader}
        />
      </ScrollablePane>
    </div>
  );
};

export default TableView;

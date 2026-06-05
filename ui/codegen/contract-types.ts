/* GENERATED FILE. DO NOT EDIT BY HAND.
 * Source: ui/contract/contract.json
 */

export type UiRole = "alert" | "avatar" | "badge" | "breadcrumb" | "button" | "card" | "checkbox" | "divider" | "empty-state" | "field" | "form" | "grid" | "icon-button" | "input" | "link" | "list" | "modal" | "nav" | "page" | "radio" | "section" | "select" | "stack" | "switch" | "tab" | "table" | "tabs" | "text" | "textarea" | "toast" | "toolbar";

export interface UiRoleAttributesMap {
  "alert": {
    tone?: "info" | "success" | "warning" | "danger";
    variant?: "subtle" | "solid";
  };
  "avatar": {
    shape?: "circle" | "rounded";
    size?: "sm" | "md" | "lg";
  };
  "badge": {
    tone?: "neutral" | "success" | "warning" | "danger" | "info";
    variant?: "solid" | "subtle";
  };
  "breadcrumb": {
    size?: "sm" | "md";
  };
  "button": {
    size?: "sm" | "md" | "lg";
    state?: "default" | "loading" | "disabled";
    variant?: "primary" | "secondary" | "ghost" | "danger";
  };
  "card": {
    elevation?: "none" | "sm" | "md";
    padding?: "sm" | "md" | "lg";
    variant?: "default" | "outlined";
  };
  "checkbox": {
    size?: "sm" | "md";
    state?: "default" | "disabled";
  };
  "divider": {
    orientation?: "horizontal" | "vertical";
    tone?: "default" | "subtle";
  };
  "empty-state": {
    tone?: "neutral" | "info";
    variant?: "default" | "compact";
  };
  "field": {
    state?: "default" | "error" | "disabled";
  };
  "form": {
    density?: "comfortable" | "compact";
    layout?: "vertical" | "horizontal";
  };
  "grid": {
    cols?: "1" | "2" | "3" | "4" | "6" | "12";
    gap?: "0" | "1" | "2" | "3" | "4" | "5";
  };
  "icon-button": {
    size?: "sm" | "md";
    state?: "default" | "disabled";
    variant?: "ghost" | "secondary";
  };
  "input": {
    size?: "sm" | "md" | "lg";
    state?: "default" | "error" | "disabled";
  };
  "link": {
    tone?: "primary" | "neutral";
    variant?: "default" | "subtle";
  };
  "list": {
    density?: "comfortable" | "compact";
    variant?: "plain" | "rows" | "cards";
  };
  "modal": {
    size?: "sm" | "md" | "lg";
    state?: "open" | "closed";
  };
  "nav": {
    state?: "default" | "collapsed";
    variant?: "sidebar" | "top";
  };
  "page": {
    density?: "comfortable" | "compact";
    layout?: "app" | "auth" | "settings";
  };
  "radio": {
    size?: "sm" | "md";
    state?: "default" | "disabled";
  };
  "section": {
    padding?: "none" | "sm" | "md" | "lg";
    variant?: "default" | "subtle";
  };
  "select": {
    size?: "sm" | "md" | "lg";
    state?: "default" | "error" | "disabled";
  };
  "stack": {
    align?: "start" | "center" | "end" | "stretch";
    direction?: "row" | "col";
    gap?: "0" | "1" | "2" | "3" | "4" | "5";
    justify?: "start" | "center" | "between" | "end";
    wrap?: "wrap" | "nowrap";
  };
  "switch": {
    size?: "sm" | "md";
    state?: "default" | "disabled";
  };
  "tab": {
    state?: "active" | "inactive" | "disabled";
  };
  "table": {
    density?: "comfortable" | "compact";
    variant?: "default" | "striped";
  };
  "tabs": {
    size?: "sm" | "md";
    variant?: "line" | "pill";
  };
  "text": {
    tone?: "primary" | "secondary" | "muted" | "danger";
    variant?: "body" | "caption" | "label" | "h3" | "h2" | "h1";
  };
  "textarea": {
    size?: "sm" | "md" | "lg";
    state?: "default" | "error" | "disabled";
  };
  "toast": {
    tone?: "info" | "success" | "warning" | "danger";
    variant?: "subtle" | "solid";
  };
  "toolbar": {
    align?: "start" | "between" | "end";
    wrap?: "wrap" | "nowrap";
  };
}

export type UiAttrsForRole<R extends UiRole> = UiRoleAttributesMap[R];

export interface UiRoleSlotsMap {
  "alert": "title" | "body" | "actions";
  "avatar": never;
  "badge": never;
  "breadcrumb": never;
  "button": never;
  "card": "header" | "body" | "footer";
  "checkbox": never;
  "divider": never;
  "empty-state": "icon" | "title" | "body" | "actions";
  "field": "label" | "control" | "help" | "error";
  "form": "actions";
  "grid": never;
  "icon-button": never;
  "input": never;
  "link": never;
  "list": never;
  "modal": "header" | "body" | "footer";
  "nav": never;
  "page": "header" | "content" | "footer" | "aside";
  "radio": never;
  "section": "header" | "content" | "footer";
  "select": never;
  "stack": never;
  "switch": never;
  "tab": never;
  "table": never;
  "tabs": never;
  "text": never;
  "textarea": never;
  "toast": "title" | "body" | "actions";
  "toolbar": "start" | "center" | "end";
}

export type UiSlotsForRole<R extends UiRole> = UiRoleSlotsMap[R];

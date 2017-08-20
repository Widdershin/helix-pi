import {
  makeDOMDriver,
  h1,
  h2,
  span,
  div,
  input,
  a,
  h,
  button,
  DOMSource,
  VNode
} from "@cycle/dom";
import { makeHistoryDriver } from "@cycle/history";
import isolate from "@cycle/isolate";
import makeIDBDriver, { $add, $update } from "cycle-idb";
import { timeDriver, TimeSource } from "@cycle/time";
import { run } from "@cycle/run";
import { routerify, RouterSource, RouterSink } from "cyclic-router";
import switchPath from "switch-path";
import * as uuid from "uuid";
import xs, { Stream } from "xstream";

import { Scenario } from "./index";

interface Project {
  id: string;
  name: string;
  selectedScenarioId: null | string;

  scenarios: Scenario[];
}

interface ISources {
  DOM: DOMSource;
  Time: TimeSource;
  Router: RouterSource;
  DB: any;
  ID: IDSource;
  id?: string;
}

interface ISinks {
  DOM: Stream<VNode>;
  Router?: RouterSink;
  DB?: any;
}

function homeView(projects: Project[]): VNode {
  return div(".welcome", [
    h1("Helix Pi"),

    div(".options", [
      a(".new-project", "Create new project"),

      div(".recent-projects", [
        h2("Recent projects"),

        div(
          ".projects.flex-column",
          projects.map(project =>
            a(
              ".goto-project",
              { attrs: { href: `/project/${project.id}` } },
              project.name
            )
          )
        )
      ])
    ])
  ]);
}

function Home(sources: ISources): ISinks {
  const projects$ = sources.DB.store("projects").getAll();

  return {
    DOM: projects$.map(homeView)
  };
}

interface IProjectNameSources extends ISources {
  name$: Stream<string>;
}

interface IProjectNameSinks extends ISinks {
  name$: Stream<string>;
  nameChange$: Stream<string>;
}

function ProjectName(sources: IProjectNameSources): IProjectNameSinks {
  const startEditing$ = sources.DOM
    .select(".edit-project-name")
    .events("click")
    .mapTo(true);

  const save$ = sources.DOM
    .select(".save-project-name")
    .events("click")
    .mapTo(false);

  const cancelEditing$ = sources.DOM
    .select(".cancel-editing-project-name")
    .events("click")
    .mapTo(false);

  const editing$ = xs.merge(xs.of(false), startEditing$, save$, cancelEditing$);

  const newName$ = sources.DOM
    .select(".project-name-input")
    .events("input")
    .map((ev: any) => ev.currentTarget.value);

  const nameChange$ = newName$.map(name => save$.mapTo(name)).flatten();

  function view([name, editing]: [string, boolean]): VNode {
    if (editing) {
      return div(".project-name-container", [
        div([
          input(".project-name-input", { props: { value: name } }),
          a(".save-project-name", " ✓ "),
          a(".cancel-editing-project-name", " ✖ ")
        ])
      ]);
    }

    return div(".project-name-container", [
      div([span(".project-name", `${name}`), a(".edit-project-name", " ✎ ")])
    ]);
  }

  return {
    DOM: xs.combine(sources.name$, editing$).map(view),

    name$: xs.merge(sources.name$, nameChange$),

    nameChange$
  };
}

function makeScenario(): Scenario {
  return {
    name: "Untitled scenario",
    input: {},
    actors: {},
    id: uuid.v4()
  };
}

function renderScenarioButton(scenario: Scenario): VNode {
  return div(".scenario-button", [
    a(".select-scenario", { attrs: { "data-id": scenario.id } }, scenario.name)
  ]);
}

function renderScenario(scenario: Scenario, scenarioNameVtree: VNode): VNode {
  scenario;
  const lines = new Array(Math.ceil(800 / 48)).fill(0);

  return div(".scenario", [
    scenarioNameVtree,

    h("svg", { attrs: { width: 800, height: 600 } }, [
      ...lines.map((_, index) =>
        h("line", {
          attrs: {
            x1: 0,
            y1: index * 48,
            x2: 800,
            y2: index * 48,
            stroke: "#333"
          }
        })
      ),

      ...lines.map((_, index) =>
        h("line", {
          attrs: {
            x1: index * 48,
            y1: 0,
            x2: index * 48,
            y2: 600,
            stroke: "#333"
          }
        })
      )
    ])
  ]);
}

function activeScenario(project: Project): Scenario | undefined {
  return project.scenarios.find(
    scenario => scenario.id === project.selectedScenarioId
  );
}

function Project(sources: ISources): ISinks {
  const projectResult$ = sources.DB.store("projects").get(sources.id);

  const project$ = projectResult$.filter(Boolean).debug("project$") as Stream<
    Project
  >;

  const initialPersistence$ = projectResult$
    .filter((project: Project | undefined) => project === undefined)
    .mapTo(
      $add("projects", { id: sources.id, name: "Untitled", scenarios: [] })
    );

  const nameComponent = isolate(ProjectName)({
    ...sources,
    name$: project$.map((project: any) => project.name)
  });

  const changeName$ = nameComponent.nameChange$.map(
    (name: string) => (project: any): any => ({
      ...project,
      name
    })
  );

  const addScenario$ = sources.DOM
    .select(".add-scenario")
    .events("click")
    .map(() => (project: Project): Project => {
      const scenario = makeScenario();

      return {
        ...project,

        selectedScenarioId: scenario.id,

        scenarios: project.scenarios.concat(scenario)
      };
    });

  const selectScenario$ = sources.DOM
    .select(".select-scenario")
    .events("click")
    .map(ev => (project: Project): Project => {
      return {
        ...project,

        selectedScenarioId: (ev.currentTarget as any).dataset.id
      };
    });

  const activeScenario$ = project$
    .map(activeScenario)
    .filter(Boolean) as Stream<Scenario>;

  const activeScenarioName$ = activeScenario$.map(scenario => scenario.name);

  const scenarioNameComponent = isolate(ProjectName)({
    ...sources,
    name$: activeScenarioName$
  });

  const changeScenarioName$ = scenarioNameComponent.nameChange$.map(
    (name: string) => {
      return function(project: Project): Project {
        return {
          ...project,
          scenarios: project.scenarios.map(
            (scenario: Scenario) =>
              scenario.id === project.selectedScenarioId
                ? { ...scenario, name }
                : scenario
          )
        };
      };
    }
  );

  const reducer$ = xs.merge(
    changeName$,
    addScenario$,
    selectScenario$,
    changeScenarioName$
  );

  const update$ = project$
    .map(project =>
      reducer$.map((reducer: (project: Project) => Project) => $update("projects", reducer(project)))
    )
    .flatten();

  return {
    DOM: xs
      .combine(
        project$,
        nameComponent.DOM,
        scenarioNameComponent.DOM.startWith(div())
      )
      .map(([project, nameVtree, scenarioNameVtree]: [any, VNode, VNode]) =>
        div(".project", [
          div(".sidebar.flex-column", [
            nameVtree,
            "Scenarios",
            div(".scenarios", project.scenarios.map(renderScenarioButton)),
            button(".add-scenario", "Add scenario")
          ]),
          div(".preview", [
            project.selectedScenarioId
              ? renderScenario(
                  activeScenario(project) as Scenario,
                  scenarioNameVtree
                )
              : "No scenario selected"
          ])
        ])
      ),

    DB: xs.merge(initialPersistence$, update$)
  };
}

type Component = (sources: ISources) => ISinks;
type RouterMatch = {
  path: string;
  value: Component;
};

function extendSources(component: any, additionalSources: object) {
  return (sources: object) => component({ ...sources, ...additionalSources });
}

function view(child: VNode): VNode {
  return div(".helix-pi", [
    div(".nav-bar", ["Helix Pi", " - ", a(".home", "Home")]),
    child
  ]);
}

function main(sources: ISources): ISinks {
  const page$ = sources.Router.define({
    "/": Home,
    "/project/:id": (id: string) => extendSources(Project, { id })
  });

  const newProject$ = sources.DOM
    .select(".new-project")
    .events("click", { preventDefault: true });

  const gotoProject$ = sources.DOM
    .select(".goto-project")
    .events("click", { preventDefault: true })
    .map((ev: MouseEvent) => (ev.target as any).pathname);

  const home$ = sources.DOM
    .select(".home")
    .events("click", { preventDefault: true });

  const component$ = page$.map((result: RouterMatch) => {
    const component = result.value;

    const componentSources = {
      ...sources,

      Router: sources.Router.path(result.path)
    };

    return component(componentSources);
  });

  const componentVtree$ = component$.map((c: ISinks) => c.DOM).flatten();

  return {
    DOM: componentVtree$.map(view),

    DB: component$.map((c: ISinks) => c.DB || xs.empty()).flatten(),

    Router: xs.merge(
      home$.mapTo(`/`),
      newProject$.mapTo(`/project/${uuid.v4()}`),
      gotoProject$
    )
  };
}

const mainWithRouter = routerify(main, switchPath, {
  historyName: "History",
  routerName: "Router"
});

type IDSource = () => number;

function idDriver(): IDSource {
  let _id = 0;

  return () => _id++;
}

const drivers = {
  DOM: makeDOMDriver(document.body),
  Time: timeDriver,
  History: makeHistoryDriver(),
  ID: idDriver,
  DB: makeIDBDriver("helix-pi", 1, (upgradeDb: any) => {
    const projectsStore = upgradeDb.createObjectStore("projects", {
      keyPath: "id"
    });
    projectsStore.createIndex("id", "id");
  })
};

run(mainWithRouter, drivers);

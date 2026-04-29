import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
export declare class Visual implements IVisual {
    private target;
    private reactRoot;
    private root;
    private host;
    private selectionManager;
    private currentActiveFilter;
    private cachedBusinessDataString;
    private cachedBaseSystemPromptString;
    private cachedCustomSystemPromptString;
    private cachedInstructionsString;
    private cachedQuickCommandsList;
    private cachedGlobalConfig;
    private cachedFilterMap;
    private settings;
    constructor(options: VisualConstructorOptions);
    update(options: VisualUpdateOptions): void;
    enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[];
    private parseSettings;
}

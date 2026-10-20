// HUIView exposes its Lovelace config and index. Walk the composed ancestor tree
// so nested cards work too; use the raw view title, not HA's generated fallback.
export function viewTitle(element:HTMLElement):string {
  let node:HTMLElement|null=element;
  while(node){
    if(['hui-view','hui-panel-view','hui-masonry-view','hui-sections-view'].includes(node.localName)){
      const view=node as HTMLElement&{index?:number;lovelace?:{rawConfig?:{views?:{title?:string}[]};config?:{views?:{title?:string}[]}}};
      const config=view.lovelace?.rawConfig??view.lovelace?.config;
      const title=config?.views?.[view.index??-1]?.title;
      if(config)return typeof title==='string'?title:'';
    }
    node=node.parentElement??((node.getRootNode() as ShadowRoot).host as HTMLElement|undefined)??null;
  }
  return '';
}

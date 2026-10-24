import {LitElement, html, css, nothing} from 'lit';
import {live} from 'lit/directives/live.js';
import type {Band, Capability, Draft, DynamicTime, EntityState, Hass, Saved, Section, Setting, Sub, Temperature} from './types';
import {bandError, begin, days, draftError, localClock, newSub, parseTime, time, uuid, validState, validTemperature} from './draft';
import {viewTitle} from './view-title';
import {allFilters,categories,categoryGroups,categoryKey,filterOptions,isFiltered,normalizeFilters,visibleSchedules,type CategoryGroup,type FilterOption,type ScheduleFilters} from './categories';
import './timeline';
import {predictedMinute,resolvedBand,solarEvents,solarDate,validDynamic} from './dynamic';
import {awayUntilLabel,localDateTime} from './away';
import {bandDisabled} from './bands';

type Popup = {kind: 'name'; value: string} | {kind:'entities'; query: string; selected?: string; target?: number; setback?: number; start?:EntityState;end?:EntityState} |
  {kind:'temperature'; key: string; target: boolean; value: number} | {kind:'state';key:string;start:boolean;value:EntityState} | {kind:'sub-disable';sub:Sub;disabled:boolean;disableMode:'permanent'|'until';until?:string} | {kind:'band'; band?: Band; start: string; end: string; start_dynamic?:DynamicTime;end_dynamic?:DynamicTime; disabled?:boolean;disableMode?:'permanent'|'until';until?:string;one_off?:boolean; reason: string} | {kind:'subs'} |
  {kind:'category';choice:string;name:string}|{kind:'filters';filters:ScheduleFilters}|{kind:'preview-subs';sectionId:string}|{kind:'away';mode:'now'|'until';until:string};

export class SchedulingManagerCard extends LitElement {
  static properties = {hass: {attribute:false,noAccessor:true}, saved:{state:true}, draft:{state:true}, popup:{state:true}, confirmation:{state:true}, error:{state:true}, connectionMessage:{state:true}, busy:{state:true}, awayAction:{state:true}, clock:{state:true}, caps:{state:true},filters:{state:true},collapsedCategories:{state:true},sharedTime:{state:true},peek:{state:true}};
  private _hass?: Hass;
  private hassViewSignature='';
  saved?: Saved;
  draft?: Draft;
  popup?: Popup;
  caps: Capability[] = [];
  error = '';
  busy = false;
  private awayAction?:'on'|'off';
  clock = localClock('UTC');
  private filters:ScheduleFilters=allFilters();
  private collapsedCategories=new Set<string>();
  private sharedTime?:{left:number;top:number;height:number};
  private layoutResize?:ResizeObserver;
  private layoutFrame?:number;
  private sharedScroll?:number;
  private lastLayoutWidth?:number;
  private followCurrentOnResize=false;
  private peek?:{sectionId:string;subId:string;day:number};
  private peekTimer?:ReturnType<typeof setTimeout>;
  private emptyTimeline:Sub={id:'empty-view',days:[],bands:[]};
  private peekInteraction=(event:Event)=>{
    if(this.popup?.kind==='preview-subs'){
      if(event instanceof KeyboardEvent&&event.key==='Escape'){this.closePreviewChooser();return;}
      const chooser=event.composedPath().some(node=>node instanceof HTMLElement&&node.dataset.previewChooser===(this.popup as Extract<Popup,{kind:'preview-subs'}>).sectionId);
      if(chooser)return;
      if(event.type==='pointerdown')this.closePreviewChooser();
    }
    if(!this.peek)return;
    if(event instanceof KeyboardEvent&&event.key==='Escape'){this.hidePeek();return;}
    const path=event.composedPath();
    const inside=path.some(node=>node instanceof HTMLElement&&node.dataset.previewScope===this.peek!.sectionId);
    const day=path.some(node=>node instanceof HTMLElement&&(node.classList.contains('view-day')||node.classList.contains('view-sub-number')));
    if(event.type==='pointerdown'&&!(inside&&day))this.hidePeek();
  };
  private unsubscribe?: () => void;
  private connection?: Hass['connection'];
  private interval?: ReturnType<typeof setInterval>;
  private epoch = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private retryDelay = 1000;
  private connectionMessage = '';
  private connectionReady = () => {void this.connect();};
  private connectionLost = () => {this.stopConnectionAttempt();};
  private confirmation?: {message:string; resolve:(yes:boolean)=>void};
  private beforeClose = (event:BeforeUnloadEvent) => {if(this.draft){event.preventDefault();event.returnValue='';}};
  private resume = () => {this.updateClock();void this.load();};
  private previewLayout=()=>{if(this.popup?.kind==='preview-subs')this.placePreviewOptions();};

  set hass(value: Hass) {
    this._hass = value;
    const reconnect=this.isConnected&&this.connection!==value.connection;
    if(reconnect)void this.connect();
    const ids=new Set(Object.values({...this.saved?.model.entity_settings,...this.draft?.settings}).map(setting=>setting.entity_id));
    const signature=JSON.stringify([viewTitle(this),...Array.from(ids,eid=>{const state=value.states[eid];return[eid,state?.attributes.friendly_name,!!state,state?.state==='unknown'||state?.state==='unavailable'];})]);
    if(reconnect||signature!==this.hassViewSignature){this.hassViewSignature=signature;this.requestUpdate();}
  }
  get hass(): Hass {return this._hass!;}
  setConfig(_config: Record<string,unknown>) {this.requestUpdate();}
  getCardSize() {return 3 + (this.saved?.model.schedules.length ?? 0) * 3;}
  connectedCallback() {
    super.connectedCallback();
    this.interval = setInterval(()=>this.updateClock(), 30000);
    document.addEventListener('visibilitychange', this.resume);
    window.addEventListener('beforeunload',this.beforeClose);
    document.addEventListener('pointerdown',this.peekInteraction,true);document.addEventListener('keydown',this.peekInteraction,true);
    document.addEventListener('scroll',this.previewLayout,true);window.addEventListener('resize',this.previewLayout);
    this.layoutResize=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(this.lastLayoutWidth===undefined||Math.abs(width-this.lastLayoutWidth)>1)this.followCurrentOnResize=true;this.lastLayoutWidth=width;this.queueTimeLayout();});this.layoutResize.observe(this);
    if (this._hass) void this.connect();
  }
  disconnectedCallback() {
    super.disconnectedCallback(); this.stopConnectionAttempt(); this.unwatchConnection();
    clearInterval(this.interval); document.removeEventListener('visibilitychange',this.resume);
    window.removeEventListener('beforeunload',this.beforeClose);
    document.removeEventListener('pointerdown',this.peekInteraction,true);document.removeEventListener('keydown',this.peekInteraction,true);clearTimeout(this.peekTimer);this.peekTimer=undefined;this.peek=undefined;
    document.removeEventListener('scroll',this.previewLayout,true);window.removeEventListener('resize',this.previewLayout);
    this.layoutResize?.disconnect();if(this.layoutFrame!==undefined)cancelAnimationFrame(this.layoutFrame);this.layoutFrame=undefined;
  }
  private async connect() {
    if(!this.isConnected||!this._hass)return;
    this.stopConnectionAttempt();
    const token=this.epoch,connection=this.hass.connection;
    if(this.connection!==connection){
      this.unwatchConnection();this.connection=connection;
      connection.addEventListener?.('ready',this.connectionReady);
      connection.addEventListener?.('disconnected',this.connectionLost);
    }
    try {
      if(!await this.load(token))return;
      const unsubscribe = await connection.subscribeMessage<Saved>(data=>{if(token===this.epoch){this.saved=data;this.updateClock();}}, {type:'scheduling_manager/subscribe'});
      if(token!==this.epoch)unsubscribe();else this.unsubscribe=unsubscribe;
      if(token===this.epoch){this.retryDelay=1000;this.connectionMessage='';}
    } catch(e) {this.retryConnection(e,token);}
  }
  private stopConnectionAttempt() {
    this.epoch++;clearTimeout(this.retry);this.retry=undefined;
    this.unsubscribe?.();this.unsubscribe=undefined;
  }
  private unwatchConnection() {
    this.connection?.removeEventListener?.('ready',this.connectionReady);
    this.connection?.removeEventListener?.('disconnected',this.connectionLost);
    this.connection=undefined;
  }
  private retryConnection(error:unknown,token:number) {
    if(token!==this.epoch||!this.isConnected)return;
    const failure=error as {code?:string;message?:string};
    this.connectionMessage=failure?.code==='unknown_command'||failure?.code==='not_loaded'
      ?'Waiting for Scheduling Manager to finish starting. Retrying automatically…'
      :`Unable to connect to Scheduling Manager. Retrying automatically… (${failure?.message??String(error)})`;
    clearTimeout(this.retry);this.retry=setTimeout(()=>void this.connect(),this.retryDelay);
    this.retryDelay=Math.min(this.retryDelay*2,30000);
  }
  private async load(token=this.epoch):Promise<boolean> {
    if(!this._hass)return false;
    const hass=this.hass;
    try {
      const saved=await hass.callWS<Saved>({type:'scheduling_manager/get'});
      const caps=await hass.callWS<Capability[]>({type:'scheduling_manager/capabilities'});
      if(token!==this.epoch||!this.isConnected)return false;
      this.saved=saved;this.caps=caps;this.updateClock();return true;
    } catch(e){this.retryConnection(e,token);return false;}
  }
  private async refreshCaps():Promise<boolean> {
    try {this.caps=await this.hass.callWS<Capability[]>({type:'scheduling_manager/capabilities'});return true;}
    catch(e){this.fail(e);return false;}
  }
  private updateClock() {const clock=localClock(this.saved?.timezone ?? 'UTC');if(clock.day!==this.clock.day||clock.minute!==this.clock.minute||clock.weekday!==this.clock.weekday)this.clock=clock;}
  private hidePeek(){clearTimeout(this.peekTimer);this.peekTimer=undefined;this.peek=undefined;}
  private resetPeekTimer(){clearTimeout(this.peekTimer);this.peekTimer=setTimeout(()=>this.hidePeek(),10000);}
  private openPreviewChooser(section:Section){if(this.popup?.kind==='preview-subs'&&this.popup.sectionId===section.id){this.closePreviewChooser();return;}clearTimeout(this.peekTimer);this.peekTimer=undefined;this.popup={kind:'preview-subs',sectionId:section.id};}
  private closePreviewChooser(){this.popup=undefined;if(this.peek)this.resetPeekTimer();}
  private previewDay(section:Section,day:number){
    if(this.peek?.sectionId===section.id&&this.peek.day===day){this.hidePeek();return;}
    const sub=section.sub_schedules.find(schedule=>schedule.days.includes(day));if(!sub)return;
    if(sub.days.includes(this.clock.day)){this.hidePeek();return;}
    this.peek={sectionId:section.id,subId:sub.id,day};this.resetPeekTimer();
  }
  private queueTimeLayout() {
    if(this.layoutFrame!==undefined||!this.isConnected)return;
    this.layoutFrame=requestAnimationFrame(()=>{this.layoutFrame=undefined;this.measureEntityLists();this.positionDisabledLabels();this.measureSharedTime();this.previewLayout();});
  }
  private syncTimelineScroll(event:Event) {
    const source=event.currentTarget as HTMLElement;
    this.sharedScroll=source.scrollLeft;
    this.shadowRoot?.querySelectorAll<HTMLElement>('hsm-timeline').forEach(timeline=>{if(timeline!==source&&Math.abs(timeline.scrollLeft-source.scrollLeft)>1)timeline.scrollLeft=source.scrollLeft;});
    this.queueTimeLayout();
  }
  private measureSharedTime() {
    const root=this.shadowRoot,card=root?.querySelector('ha-card'),sections=Array.from(root?.querySelectorAll('section')??[]);
    if(!card||!sections.length){if(this.sharedTime)this.sharedTime=undefined;return;}
    const bounds=card.getBoundingClientRect();
    const timeline=root!.querySelector<HTMLElement>('hsm-timeline');
    const canvas=timeline?.shadowRoot?.querySelector('svg');
    const region=sections[0].querySelector('.timeline-region')!.getBoundingClientRect();
    let screenX:number;
    if(canvas?.getScreenCTM()){
      const width=canvas.viewBox.baseVal.width;
      screenX=new DOMPoint(40+this.clock.minute/1440*(width-80),0).matrixTransform(canvas.getScreenCTM()!).x;
      const viewport=timeline!.getBoundingClientRect();
      if(screenX<viewport.left||screenX>viewport.right){
        if(this.followCurrentOnResize){this.followCurrentOnResize=false;timeline!.scrollLeft=40+this.clock.minute/1440*(width-80)-viewport.width/2;this.sharedScroll=timeline!.scrollLeft;root!.querySelectorAll<HTMLElement>('hsm-timeline').forEach(row=>{row.scrollLeft=timeline!.scrollLeft;});this.queueTimeLayout();return;}
        if(this.sharedTime)this.sharedTime=undefined;return;
      }
    } else {
      const minimum=parseFloat(getComputedStyle(this).getPropertyValue('--timeline-min-width'))||900;
      const width=Math.max(minimum,region.width),point=40+this.clock.minute/1440*(width-80);
      const scroll=this.sharedScroll??Math.max(0,Math.min(width-region.width,point-region.width/2));
      screenX=region.left+point-scroll;
    }
    this.followCurrentOnResize=false;
    const firstCanvas=sections[0].querySelector('hsm-timeline')?.shadowRoot?.querySelector('svg');
    const top=(firstCanvas?.getBoundingClientRect().top??sections[0].getBoundingClientRect().top+36)-bounds.top;
    const height=sections[sections.length-1].getBoundingClientRect().bottom-bounds.top-top-8;
    const next={left:screenX-bounds.left,top,height};
    if(!this.sharedTime||Object.keys(next).some(key=>Math.abs(next[key as keyof typeof next]-this.sharedTime![key as keyof typeof next])>.5))this.sharedTime=next;
  }
  private fail(error:unknown) {this.error=(error as {message?:string})?.message ?? String(error);}
  private changed() {this.draft={...this.draft!};this.openEditingCategory();}
  private openEditingCategory(){if(this.draft&&this.collapsedCategories.has(categoryKey(this.draft.section))){const next=new Set(this.collapsedCategories);next.delete(categoryKey(this.draft.section));this.collapsedCategories=next;}}
  private ask(message:string):Promise<boolean> {return new Promise(resolve=>{this.confirmation={message,resolve};});}
  private async discard(): Promise<boolean> {if(this.draft&&!await this.ask('Discard these unsaved changes?'))return false;this.draft=undefined;this.popup=undefined;this.error='';return true;}
  private async edit(section: Section) {this.hidePeek();if(!await this.discard()||!await this.refreshCaps()||this.draft||this.popup)return;const current=this.saved!.model.schedules.find(s=>s.id===section.id);if(current){this.draft=begin(this.saved!.model,current);this.openEditingCategory();}}
  private async save() {
    const draft=this.draft!;const invalid=draftError(draft,this.caps);if(invalid){this.error=invalid;return;}
    for(const sub of draft.section.sub_schedules){const name=this.subName(sub);if(name)sub.name=name;else delete sub.name;}
    if(draft.deleted&&draft.isNew){this.draft=undefined;return;}
    this.busy=true;this.error='';
    const settings:Record<string,Setting>={};
    if(!draft.deleted)for(const member of draft.section.entities)settings[member.entity_key]=draft.settings[member.entity_key];
    try {
      this.saved=await this.hass.callWS<Saved>({type:'scheduling_manager/save_section',expected_revision:draft.revision,operation:draft.deleted?'delete':'upsert',section_id:draft.section.id,...(!draft.deleted?{section:draft.section,settings}:{})});
      this.draft=undefined;this.popup=undefined;
    } catch(e){this.fail(e);} finally {this.busy=false;}
  }
  private openAway(){
    this.hidePeek();this.error='';
    const until=this.saved!.model.away_until;
    this.popup={kind:'away',mode:until?'until':'now',until:localDateTime(this.saved!.timezone,until?new Date(until):new Date(Date.now()+86400000))};
  }
  private async away(enabled:boolean,until?:string|null):Promise<boolean> {
    this.busy=true;this.awayAction=enabled?'on':'off';this.error='';
    try {this.saved=await this.hass.callWS<Saved>({type:'scheduling_manager/set_away',away:enabled,expected_revision:this.saved!.model.revision,...(until!==undefined?{until}:{})});return true;}
    catch(e){this.fail(e);return false;}finally{this.busy=false;this.awayAction=undefined;}
  }
  private async toggleSection(section:Section) {
    this.busy=true;this.error='';
    try {
      this.saved=await this.hass.callWS<Saved>({type:'scheduling_manager/set_section_enabled',expected_revision:this.saved!.model.revision,section_id:section.id,enabled:section.enabled===false});
    } catch(e){this.fail(e);}finally{this.busy=false;}
  }
  private addBand(detail:{start:number;end:number;reason?:string;method?:string}) {
    const sub=this.draft!.section.sub_schedules[this.draft!.selected];
    if(sub.bands.length>=10){this.error='Maximum ten bands per sub-schedule.';return;}
    if(detail.reason){if(detail.method==='doubleclick'){this.error='A one-hour band does not fit here. Use Add time band to choose another interval.';return;}this.popup={kind:'band',start:time(Math.min(detail.start,1435)),end:time(Math.min(detail.end,1440)),reason:'A full one-hour band does not fit here. Choose a shorter free interval explicitly.'};return;}
    sub.bands.push({id:uuid(),start_minute:detail.start,end_minute:detail.end});sub.bands.sort((a,b)=>a.start_minute-b.start_minute);this.changed();
  }
  private async removeBand(band:Band):Promise<boolean> {if(await this.ask(`Delete time band ${time(band.start_minute)}–${time(band.end_minute)}? The change takes effect on Save.`)){const sub=this.draft!.section.sub_schedules[this.draft!.selected];sub.bands=sub.bands.filter(b=>b.id!==band.id);this.changed();return true;}return false;}
  private editBand(band:Band){this.popup={kind:'band',band,start:time(band.start_minute),end:time(band.end_minute),start_dynamic:band.start_dynamic?{...band.start_dynamic}:undefined,end_dynamic:band.end_dynamic?{...band.end_dynamic}:undefined,disabled:bandDisabled(band),disableMode:band.disabled_until?'until':'permanent',until:band.disabled_until,reason:''};}
  private solarFor(sub?:Sub){return this.saved?.solar_times?.[solarDate(this.saved.timezone,sub&&!sub.days.includes(this.clock.day)?sub.days[0]:undefined)];}
  private async temperature(key:string,target:boolean) {
    const sectionId=this.draft?.section.id;
    if(!await this.refreshCaps()||!this.draft||this.draft.section.id!==sectionId)return;
    const value=target?this.draft.section.entities.find(m=>m.entity_key===key)?.target:this.draft.settings[key]?.setback;
    if(!value)return;
    const cap=this.cap(key);
    let converted=value.value;
    if(value.unit!==cap?.unit&&cap)converted=cap.unit==='°F'?value.value*9/5+32:(value.value-32)*5/9;
    this.popup={kind:'temperature',key,target,value:converted};
  }
  private cap(key:string) {return this.caps.find(c=>c.entity_id===(this.draft?.settings[key]??this.saved?.model.entity_settings[key])?.entity_id);}
  private async editState(key:string,start:boolean) {
    const sectionId=this.draft?.section.id;
    if(!await this.refreshCaps()||!this.draft||this.draft.section.id!==sectionId)return;
    const member=this.draft.section.entities.find(m=>m.entity_key===key);
    if(!member)return;
    let value=(start?member.start_state:member.end_state)!;
    const oldUnit=start?member.start_unit:member.end_unit,cap=this.cap(key);
    if(typeof value==='number'&&oldUnit&&cap?.unit&&oldUnit!==cap.unit&&['°C','°F'].includes(oldUnit)&&['°C','°F'].includes(cap.unit))value=cap.unit==='°F'?value*9/5+32:(value-32)*5/9;
    this.popup={kind:'state',key,start,value};
  }
  private async addEntity() {
    const sectionId=this.draft?.section.id;
    if(await this.refreshCaps()&&sectionId&&this.draft?.section.id===sectionId)this.popup={kind:'entities',query:''};
  }
  private async applyPopup(event:Event) {
    event.preventDefault();const p=this.popup!;this.error='';
    if(p.kind==='away'){
      if(!await this.away(true,p.mode==='until'?p.until:null))return;
    } else if(p.kind==='name') {
      if(!p.value.trim()){this.error='Enter a name.';return;}
      try {this.draft=begin(this.saved!.model,undefined,p.value.trim());}
      catch(error){this.fail(error);return;}
      this.openEditingCategory();
    } else if(p.kind==='category') {
      const name=p.choice==='new'?p.name.trim():p.choice.startsWith('category:')?p.choice.slice(9):null;
      if(p.choice==='new'&&!name){this.error='Enter a category name.';return;}
      this.draft!.section.category=name;this.changed();
    } else if(p.kind==='filters') {
      this.filters=normalizeFilters(p.filters,filterOptions(this.saved!.model.schedules,this.saved!.locations));this.openEditingCategory();
    } else if(p.kind==='temperature') {
      const cap=this.cap(p.key);if(!cap||!validTemperature(p.value,cap)){this.error='Temperature is out of range or off the supported step.';return;}
      const value={value:p.value,unit:cap.unit!};
      if(p.target)this.draft!.section.entities.find(m=>m.entity_key===p.key)!.target=value;else this.draft!.settings[p.key].setback=value;
      this.changed();
    } else if(p.kind==='state') {
      const cap=this.cap(p.key);if(!cap||!validState(p.value,cap)){this.error='Choose a valid state for this entity.';return;}
      const member=this.draft!.section.entities.find(m=>m.entity_key===p.key)!;
      if(p.start){member.start_state=p.value;if(cap.kind==='number')member.start_unit=cap.unit??'';}
      else {member.end_state=p.value;if(cap.kind==='number')member.end_unit=cap.unit??'';}
      this.changed();
    } else if(p.kind==='entities') {
      const cap=this.caps.find(c=>c.entity_id===p.selected);if(!cap||!cap.supported){this.error='Select a writable entity.';return;}
      const climate=cap.entity_id.startsWith('climate.');
      if(climate?(p.target===undefined||p.setback===undefined||!validTemperature(p.target,cap)||!validTemperature(p.setback,cap)):(!validState(p.start,cap)||!validState(p.end,cap))){this.error=climate?'Choose valid temperatures.':'Choose valid Start and Stop states.';return;}
      const existing=Object.entries(this.draft!.settings).find(([,s])=>s.entity_id===cap.entity_id);
      const key=existing?.[0]??uuid();
      this.draft!.settings[key]=existing?.[1]??{entity_id:cap.entity_id,registry_id:cap.registry_id,...(climate?{setback:{value:p.setback!,unit:cap.unit!}}:{})};
      this.draft!.section.entities.push(climate?{entity_key:key,target:{value:p.target!,unit:cap.unit!}}:{entity_key:key,start_state:p.start!,end_state:p.end!,...(cap.kind==='number'?{start_unit:cap.unit??'',end_unit:cap.unit??''}:{})});this.changed();
    } else if(p.kind==='sub-disable') {
      if(p.disabled&&p.disableMode==='until'&&!p.until){this.error='Choose a date and time to re-enable the sub-schedule.';return;}
      delete p.sub.enabled;delete p.sub.disabled_until;
      if(p.disabled){p.sub.enabled=false;if(p.disableMode==='until')p.sub.disabled_until=p.until;}
      this.changed();
    } else if(p.kind==='band') {
      const start=parseTime(p.start);let end=parseTime(p.end);const sub=this.draft!.section.sub_schedules[this.draft!.selected];
      if(!p.end_dynamic&&Number.isInteger(end)){
        if(!p.start_dynamic&&Number.isInteger(start)&&end<start+5&&start<1440)end=Math.min(1440,start+5);
        // A solar minimum can be off the fixed five-minute grid. Retain an
        // Keep persisted end_* fields for compatibility; the UI calls this Stop.
        if(p.start_dynamic){const minutes=resolvedBand({id:'popup',start_minute:start,end_minute:end,start_dynamic:p.start_dynamic},this.solarFor(sub));if(minutes&&end<=minutes[0])end=Math.floor(end/5)*5;}
      }
      const band:Band={id:p.band?.id??uuid(),start_minute:start,end_minute:end,...(p.start_dynamic?{start_dynamic:{...p.start_dynamic}}:{}),...(p.end_dynamic?{end_dynamic:{...p.end_dynamic}}:{})};
      if(p.band?.one_off||(!p.band&&p.one_off))band.one_off=true;
      if(p.disabled&&!band.one_off){
        band.enabled=false;
        if(p.disableMode==='until'){
          if(!p.until){this.error='Choose a date and time to re-enable the band.';return;}
          band.disabled_until=p.until;
        }
      }
      const error=bandError(sub,start,end,p.band?.id,band);if(error){this.error=error;return;}
      if(p.band){delete p.band.start_dynamic;delete p.band.end_dynamic;delete p.band.enabled;delete p.band.disabled_until;Object.assign(p.band,band);if(p.band.one_off_run)delete p.band.one_off_run.minutes;}
      else sub.bands.push(band);
      sub.bands.sort((a,b)=>a.start_minute-b.start_minute);this.changed();
    }
    this.popup=undefined;
  }
  private chooseEntity(cap:Capability) {
    const p=this.popup as Extract<Popup,{kind:'entities'}>;
    if(!cap.entity_id.startsWith('climate.')){
      let suggested:EntityState=cap.current??'';
      if(!validState(suggested,cap))suggested=cap.kind==='number'?(cap.min??0):(cap.options?.[0]??'');
      this.popup={...p,selected:cap.entity_id,start:suggested,end:suggested};return;
    }
    const existing=Object.values(this.draft!.settings).find(s=>s.entity_id===cap.entity_id);
    const suggested=typeof cap.current==='number'&&validTemperature(cap.current,cap)?cap.current:cap.min!;
    let setback=existing?.setback?.value??suggested;
    if(existing?.setback&&existing.setback.unit!==cap.unit)setback=cap.unit==='°F'?setback*9/5+32:(setback-32)*5/9;
    this.popup={...p,selected:cap.entity_id,target:suggested,setback};
  }
  private trashIcon(){return html`<svg class="trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>`;}
  private subName(sub?:Sub){return typeof sub?.name==='string'?sub.name.trim():'';}
  private subLabel(sub:Sub,index:number){const name=this.subName(sub);return `${index+1}${name?` · ${name}`:''}`;}
  private section(section:Section, editing:boolean) {
    const draft=editing?this.draft!:undefined;
    const settings=draft?.settings??this.saved!.model.entity_settings;
    const selected=draft?.selected??section.sub_schedules.findIndex(s=>s.days.includes(this.clock.day));
    const sub=section.sub_schedules[selected];
    const subDisabled=!!sub&&bandDisabled(sub);
    const allDaysAssigned=new Set(section.sub_schedules.flatMap(schedule=>schedule.days)).size===7;
    const away=this.saved!.model.away&&section.away_enabled!==false;
    const enabled=section.enabled!==false;
    const preview=!editing&&this.peek?.sectionId===section.id?section.sub_schedules.find(schedule=>schedule.id===this.peek!.subId):undefined;
    const displayedSub=preview??sub;
    const displayedSubNumber=displayedSub?section.sub_schedules.indexOf(displayedSub)+1:undefined;
    const displayedSubLabel=displayedSub?this.subLabel(displayedSub,displayedSubNumber!-1):'';
    const viewStatus=!editing?(away?'Away':!enabled?'Disabled':!sub?'No Schedule':undefined):undefined;
    return html`<section class=${`${editing?'editing ':!enabled?'disabled-schedule ':''}${this.popup?.kind==='preview-subs'&&this.popup.sectionId===section.id?'preview-open ':''}${section.category?'has-category':''}`} aria-label=${section.name} ?inert=${editing&&this.busy}>
      ${section.category?html`<span class="category-watermark" aria-label=${`Category: ${section.category}`}>${section.category}</span>`:nothing}
      <div class="schedule-panel">
      <div class="section-meta">
        <button class="name" ?disabled=${!editing} @click=${()=>{const name=prompt('Rename section',section.name);if(name!==null){section.name=name;this.changed();}}}>${section.name}</button>
        ${!editing?html`<div class="tools"><button class=${enabled?'disable':'enable'} ?disabled=${!this.saved!.editable||this.busy} aria-label=${`${enabled?'Disable':'Enable'} ${section.name}`} title=${enabled?'Suspend this schedule; climate entities receive setback':'Resume this schedule; apply active start values'} @click=${()=>this.toggleSection(section)}>${enabled?'Disable':'Enable'}</button><button class="burger" ?disabled=${!this.saved!.editable||this.busy} aria-label=${`Edit ${section.name}`} @click=${()=>this.edit(section)}><ha-icon icon="mdi:cog" aria-hidden="true"></ha-icon></button></div>`:nothing}
      </div>
      ${section.entities.length>6?html`<div class="entity-scroll-controls"><span>${section.entities.length} entities</span><button aria-label=${`Scroll ${section.name} entities up`} @click=${(e:Event)=>this.scrollEntities(e,-1)}>↑</button><button aria-label=${`Scroll ${section.name} entities down`} @click=${(e:Event)=>this.scrollEntities(e,1)}>↓</button></div>`:nothing}
      <div class=${`entity-list ${section.entities.length>6?'overflowing':''}`} role="region" aria-label=${`${section.name} entities`} tabindex=${section.entities.length>6?'0':'-1'}><div class="entities">${section.entities.map(member=>{
        const setting=settings[member.entity_key];const cap=this.caps.find(c=>c.entity_id===setting.entity_id);
        const liveState=this.hass.states[setting.entity_id];const available=!!liveState&&(liveState.state===undefined?!!cap?.available:!['unknown','unavailable'].includes(liveState.state));
        const temp=(value:Temperature,target:boolean)=>html`<button class=${target?'target':'setback'} ?disabled=${!editing} aria-label=${`${target?'Target':'Shared setback'} for ${cap?.name??setting.entity_id}`} @click=${()=>this.temperature(member.entity_key,target)}>${value.value}<small>${value.unit}</small></button>`;
        const state=(value:EntityState,start:boolean)=>html`<button class=${start?'target':'setback'} ?disabled=${!editing} aria-label=${`${start?'Start':'Stop'} state for ${cap?.name??setting.entity_id}`} @click=${()=>this.editState(member.entity_key,start)}>${value==='on'||value==='off'?value.toUpperCase():value}${start?member.start_unit?html`<small>${member.start_unit}</small>`:nothing:member.end_unit?html`<small>${member.end_unit}</small>`:nothing}</button>`;
        const climate=setting.entity_id.startsWith('climate.');
        return html`<div class="entity">${climate?temp(member.target!,true):state(member.start_state!,true)}<span title=${setting.entity_id}>${liveState?.attributes.friendly_name??cap?.name??setting.entity_id}${!available?html`<small>Unavailable · cached settings</small>`:nothing}</span>${climate?temp(setting.setback!,false):state(member.end_state!,false)}${editing?html`<button class="trash-button entity-trash" aria-label=${`Remove ${setting.entity_id}`} title="Remove entity from section" @click=${async()=>{if(await this.ask('Remove this entity on Save?')){section.entities=section.entities.filter(m=>m.entity_key!==member.entity_key);this.changed();}}}>${this.trashIcon()}</button>`:nothing}</div>`;
      })}</div></div>
      ${editing?html`<div class="edit-footer"><div class="edit-actions"><button class="add" @click=${this.addEntity}>＋ Entity</button><button class=${section.away_enabled!==false?'selected':'disable'} aria-label="Schedule Away participation" aria-pressed=${section.away_enabled!==false} @click=${()=>{section.away_enabled=section.away_enabled===false;this.changed();}}>Away ${section.away_enabled!==false?'included':'excluded'}</button></div><div class="edit-bottom"><button class="category-button" aria-label="Assign category" @click=${()=>{this.popup={kind:'category',choice:section.category?`category:${section.category}`:'none',name:''};}}>Category${section.category?`: ${section.category}`:''}</button><div class="tools"><button class="trash-button section-trash" aria-label="Delete section" title="Delete schedule section" @click=${async()=>{if(await this.ask('Delete this whole section on Save?')){this.draft!.deleted=true;this.changed();}}}>${this.trashIcon()}</button><button ?disabled=${this.busy} @click=${()=>this.discard()}>Cancel</button><button class="save" ?disabled=${this.busy||!!draftError(draft!,this.caps)} @click=${this.save}>Save</button></div></div></div>`:nothing}
      </div>
      <div class="timeline-region" data-preview-scope=${section.id}>
        ${!editing?html`<div class="view-days" role="list" aria-label="Schedule days">${days.map((label,day)=>{
          const owner=section.sub_schedules.find(schedule=>schedule.days.includes(day));
          if(!owner)return html`<span class="view-day unscheduled" role="listitem" aria-label=${`${label}: No schedule`}>${label}</span>`;
          if(owner===sub)return html`<span role="listitem"><button class=${`view-day active ${bandDisabled(owner)?'disabled-day':''}`} aria-label=${`Show current ${label} sub-schedule${bandDisabled(owner)?', disabled':''}`} @click=${()=>this.previewDay(section,day)}>${label}</button></span>`;
          const previewed=owner===preview;
          return html`<span role="listitem"><button class=${`view-day inactive ${previewed?'previewed':''} ${bandDisabled(owner)?'disabled-day':''}`} aria-label=${`Preview ${label} sub-schedule${bandDisabled(owner)?', disabled':''}`} aria-pressed=${previewed} @click=${()=>this.previewDay(section,day)}>${label}</button></span>`;
        })}<span class="preview-selection" role="listitem" data-preview-chooser=${section.id}><span class="preview-size" aria-hidden="true">${section.sub_schedules.map((schedule,index)=>html`<span>${this.subLabel(schedule,index)}</span>`)}</span>${displayedSubNumber?html`<button class=${`view-sub-number ${preview?'preview':'current'} ${this.subName(displayedSub)?'named':''}`} aria-label=${`Choose preview sub-schedule; ${preview?'preview':'current'} ${displayedSubLabel}`} aria-expanded=${this.popup?.kind==='preview-subs'&&this.popup.sectionId===section.id} title="Choose a sub-schedule to preview" @click=${()=>this.openPreviewChooser(section)}>${displayedSubLabel}</button>`:nothing}${this.popup?.kind==='preview-subs'&&this.popup.sectionId===section.id?this.previewChoices(section,displayedSub):nothing}</span></div>`:nothing}
        ${!editing&&!viewStatus&&displayedSub?.disabled_until&&bandDisabled(displayedSub)?html`<p class="sub-disabled-until">Disabled until ${awayUntilLabel(displayedSub.disabled_until,this.saved!.timezone)}</p>`:nothing}
        ${draft?.deleted?html`<p class="empty">Section pending deletion. Save commits; Cancel restores.</p>`:html`
          ${editing?html`<div class="days">${days.map((day,d)=>{const owner=section.sub_schedules.findIndex(s=>s.days.includes(d));const blocked=owner!==-1&&owner!==selected,locked=sub.bands.some(b=>b.one_off_run);return html`<button class=${sub.days.includes(d)?`selected ${bandDisabled(sub)?'disabled-day':''}`:''} ?disabled=${blocked||locked} title=${locked?'Selected one-off weekdays are read-only':blocked?`Assigned to sub-schedule ${owner+1}`:day} aria-pressed=${sub.days.includes(d)} @click=${()=>{sub.days=sub.days.includes(d)?sub.days.filter(v=>v!==d):[...sub.days,d];this.changed();}}>${day}</button>`;})}
            <select class="sub-selector" aria-label="Choose sub-schedule" .value=${String(selected)} @change=${(e:Event)=>{this.draft!.selected=Number((e.target as HTMLSelectElement).value);this.changed();}}>${section.sub_schedules.map((schedule,index)=>html`<option value=${String(index)} ?selected=${index===selected} title=${schedule.days.map(day=>days[day]).join(', ')||'No days yet'}>${this.subLabel(schedule,index)}</option>`)}</select>
            ${section.sub_schedules.length<7&&!allDaysAssigned?html`<button class="add" aria-label="Add sub-schedule" title="Add sub-schedule" @click=${()=>{section.sub_schedules.push(newSub());this.draft!.selected=section.sub_schedules.length-1;this.changed();}}>＋</button>`:nothing}
            <button class=${subDisabled?'enable':'disable'} aria-label=${`${subDisabled?'Enable':'Disable'} sub-schedule`} @click=${()=>{if(subDisabled){delete sub.enabled;delete sub.disabled_until;this.changed();}else{this.popup={kind:'sub-disable',sub,disabled:false,disableMode:sub.disabled_until?'until':'permanent',until:sub.disabled_until};}}}>${subDisabled?'Enable':'Disable'}</button>
            ${section.sub_schedules.length>1?html`<button class="remove" aria-label="Delete sub-schedule" title="Delete sub-schedule" @click=${async()=>{if(await this.ask('Delete this sub-schedule on Save?')){section.sub_schedules.splice(selected,1);this.draft!.selected=0;this.changed();}}}>${this.trashIcon()}</button>`:nothing}
          </div><label class="sub-name">Sub-schedule name (optional)<input aria-label="Sub-schedule name" placeholder=${`Sub-schedule ${selected+1}`} .value=${live(typeof sub.name==='string'?sub.name:'')} @input=${(e:Event)=>{sub.name=(e.target as HTMLInputElement).value;this.changed();}}></label>${away?html`<p>Away active — normal transitions are suspended.</p>`:!enabled?html`<p>Schedule disabled.</p>`:nothing}`:nothing}
          ${viewStatus?html`<p class=${`empty ${viewStatus==='Disabled'?'disabled-empty ':''}${preview?'peek-status':''}`}>${viewStatus==='Disabled'?html`<span class="disabled-placeholder" aria-hidden="true">Disabled</span><span class="disabled-label">Disabled</span>`:viewStatus}</p>`:nothing}
          ${viewStatus&&!preview?nothing:html`<div class=${`peek-timeline ${viewStatus?'status-preview':''}`}><hsm-timeline .sub=${viewStatus?this.emptyTimeline:sub!} .solarMinutes=${this.solarFor(editing?sub:undefined)} .previewSolarMinutes=${this.saved?.solar_times?.[solarDate(this.saved.timezone,this.peek?.day)]} .previewSub=${preview} .previewDay=${preview?days[this.peek!.day]:''} .edit=${editing} .minute=${this.clock.minute} .showCurrentTime=${false} @scroll=${this.syncTimelineScroll} @timeline-layout=${this.queueTimeLayout} @band-change=${()=>this.changed()} @band-add=${(e:CustomEvent)=>this.addBand(e.detail)} @band-delete=${(e:CustomEvent)=>this.removeBand(e.detail)} @band-edit=${(e:CustomEvent<Band>)=>this.editBand(e.detail)}></hsm-timeline></div>`}
          ${editing?html`<button class="add-band" ?disabled=${sub.bands.length>=10} @click=${()=>{this.popup={kind:'band',start:'12:00',end:'13:00',reason:''};}}>＋ Add time band</button>`:nothing}
        `}
      </div>
    </section>`;
  }
  private measureEntityLists(){
    this.shadowRoot?.querySelectorAll<HTMLElement>('.entity-list.overflowing').forEach(list=>{
      const entities=Array.from(list.querySelectorAll<HTMLElement>('.entity')).slice(0,6);
      const grid=list.querySelector<HTMLElement>('.entities')!;
      const top=grid.getBoundingClientRect().top;
      const height=Math.ceil(Math.max(...entities.map(entity=>entity.getBoundingClientRect().bottom))-top);
      if(height>0&&list.style.maxHeight!==`${height}px`)list.style.maxHeight=`${height}px`;
    });
  }
  private positionDisabledLabels(){
    this.shadowRoot?.querySelectorAll<HTMLElement>('.disabled-label').forEach(label=>{
      const section=label.closest('section'),category=section?.querySelector('.category-watermark'),panel=section?.querySelector('.schedule-panel');
      const region=label.closest('.timeline-region'),status=label.parentElement;
      if(!region||!status)return;
      const regionRect=region.getBoundingClientRect(),labelHeight=label.getBoundingClientRect().height;
      if(!matchMedia('(max-width: 850px)').matches&&category){const rect=category.getBoundingClientRect();label.style.top=`${rect.top+rect.height/2-regionRect.top-labelHeight/2}px`;status.style.height='56px';}
    });
  }
  private scrollEntities(event:Event,direction:number){
    const list=(event.currentTarget as HTMLElement).closest('.schedule-panel')?.querySelector<HTMLElement>('.entity-list');
    list?.scrollBy({top:direction*list.clientHeight,behavior:'smooth'});
  }
  private toggleCategory(group:CategoryGroup){
    const next=new Set(this.collapsedCategories);
    if(next.has(group.key))next.delete(group.key);else{next.add(group.key);if(group.sections.some(section=>section.id===this.peek?.sectionId)){this.hidePeek();if(this.popup?.kind==='preview-subs')this.popup=undefined;}}
    this.collapsedCategories=next;
  }
  private setAllCategories(groups:CategoryGroup[],collapsed:boolean){
    this.hidePeek();if(this.popup?.kind==='preview-subs')this.popup=undefined;
    this.collapsedCategories=collapsed?new Set([...this.collapsedCategories,...groups.map(group=>group.key),...(this.saved?.model.schedules.map(categoryKey)??[])]):new Set();
  }
  private categoryView(group:CategoryGroup){
    const collapsed=this.collapsedCategories.has(group.key),id=`group-${encodeURIComponent(group.key)}`;
    return html`<div class="category-group" data-category=${group.key}><button class=${`category-heading ${group.active?'running':''}`} aria-label=${`${collapsed?'Expand':'Collapse'} ${group.name} category`} aria-expanded=${!collapsed} aria-controls=${id} @click=${()=>this.toggleCategory(group)}><span class="category-activity">${group.active?`${group.active} active schedule${group.active===1?'':'s'}`:nothing}</span><span class="category-title">${group.name}</span><span class="category-arrow" aria-hidden="true"><svg class=${collapsed?'':'expanded'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></button><div id=${id} class="category-content" role="region" aria-label=${`${group.name} schedules`} ?hidden=${collapsed}>${collapsed?nothing:group.sections.map(section=>this.section(section,this.draft?.section.id===section.id))}</div></div>`;
  }
  private previewChoices(section:Section,displayed?:Sub){
    const current=section.sub_schedules.find(sub=>sub.days.includes(this.clock.day));
    const options=section.sub_schedules.filter(sub=>sub!==displayed);
    return html`<div class="preview-options" role="group" aria-label="Preview sub-schedule">${options.map(sub=>html`<button type="button" class=${sub===current?'selected':''} @click=${()=>{this.popup=undefined;this.previewDay(section,sub.days[0]);}}>${this.subLabel(sub,section.sub_schedules.indexOf(sub))}<small>${sub===current?'Current · ':''}${sub.days.map(day=>days[day]).join(', ')}</small></button>`)}${!options.length?html`<span>No other sub-schedules.</span>`:nothing}</div>`;
  }
  private placePreviewOptions(){
    const menu=this.shadowRoot?.querySelector<HTMLElement>('.preview-options');
    const card=this.shadowRoot?.querySelector('ha-card');
    if(!menu||!card)return;
    const anchor=menu.parentElement!.getBoundingClientRect(),bounds=card.getBoundingClientRect();
    const left=Math.max(bounds.left+8,0),right=Math.min(bounds.right-8,window.innerWidth);
    menu.style.maxWidth=`${Math.max(0,Math.min(260,right-left))}px`;
    menu.style.minWidth='0';
    const width=menu.getBoundingClientRect().width;
    menu.style.left=`${Math.max(left,Math.min(anchor.left+4,right-width))-anchor.left}px`;
    const below=Math.min(bounds.bottom-8,window.innerHeight-8)-anchor.bottom-4;
    const above=anchor.top-Math.max(bounds.top+8,8)-4;
    const up=below<44&&above>below;
    const height=Math.max(0,Math.min(120,up?above:below));
    menu.style.maxHeight=`${height}px`;
    menu.style.top=up?`${-height-4}px`:`${anchor.height+4}px`;
  }
  private popupView() {
    const p=this.popup;if(!p||p.kind==='preview-subs')return nothing;
    const cap=p.kind==='temperature'||p.kind==='state'?this.cap(p.key):p.kind==='entities'?this.caps.find(c=>c.entity_id===p.selected):undefined;
    const numeric=(label:string,key:'value'|'target'|'setback',value:number|undefined,disabled=false)=>html`<label>${label} ${cap?.unit??''}<input aria-label=${label} type="number" required min=${cap?.min??''} max=${cap?.max??''} step=${cap?.step??'any'} .value=${String(value??'')} ?disabled=${disabled} @input=${(e:Event)=>{(p as any)[key]=Number((e.target as HTMLInputElement).value);}}></label>`;
    const stateField=(label:string,value:EntityState|undefined,set:(v:EntityState)=>void)=>{
      if(cap?.kind==='number')return html`<label>${label} ${cap.unit??''}<input aria-label=${label} type="number" required min=${cap.min??''} max=${cap.max??''} step=${cap.step??'any'} .value=${String(value??'')} @input=${(e:Event)=>set(Number((e.target as HTMLInputElement).value))}></label>`;
      let displayed=String(value??'');
      if(cap?.kind==='datetime'){
        displayed=displayed.replace(' ','T');
        if(/(?:Z|[+-]\d{2}:\d{2})$/.test(displayed)&&Number.isFinite(Date.parse(displayed))){
          const parts=new Intl.DateTimeFormat('en-CA',{timeZone:this.saved?.timezone??'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(displayed));
          const part=(type:string)=>parts.find(p=>p.type===type)?.value??'';
          displayed=`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
        }
      }
      if(['text','date','time','datetime'].includes(cap?.kind??''))return html`<label>${label}<input aria-label=${label} type=${cap?.kind==='datetime'?'datetime-local':cap?.kind??'text'} step="1" ?required=${cap?.kind!=='text'||(cap.min_length??0)>0} minlength=${cap?.min_length??0} maxlength=${cap?.max_length??255} pattern=${cap?.pattern??'.*'} .value=${displayed} @input=${(e:Event)=>set((e.target as HTMLInputElement).value)}></label>`;
      return html`<label>${label}<select aria-label=${label} required .value=${String(value??'')} @change=${(e:Event)=>set((e.target as HTMLSelectElement).value)}><option value="" disabled ?selected=${value===undefined}>Choose a state</option>${(cap?.options??[]).map(option=>html`<option value=${option} ?selected=${option===value}>${option==='on'||option==='off'?option.toUpperCase():option||'(Empty)'}</option>`)}</select></label>`;
    };
    const previewSub=this.draft?.section.sub_schedules[this.draft.selected];
    const previewDate=solarDate(this.saved?.timezone??'UTC',previewSub&&!previewSub.days.includes(this.clock.day)?previewSub.days[0]:undefined);
    const resolved=p.kind==='band'&&validDynamic(p.start_dynamic)&&validDynamic(p.end_dynamic)?resolvedBand({id:'popup-preview',start_minute:parseTime(p.start),end_minute:parseTime(p.end),start_dynamic:p.start_dynamic,end_dynamic:p.end_dynamic},this.solarFor(previewSub)):undefined;
    const endMinimum=p.kind==='band'&&!p.end_dynamic&&resolved&&Number.isFinite(resolved[0])?Math.min(1440,resolved[0]+(p.start_dynamic?0:5)):undefined;
    const displayedStop=resolved&&Number.isFinite(resolved[1])?Math.max(resolved[1],endMinimum??0):undefined;
    const fixedTime=(endpoint:'start'|'end',label:string)=>{
      if(p.kind!=='band')return nothing;
      const value=endpoint==='end'&&displayedStop!==undefined?time(displayedStop):p[endpoint];
      const [hour,minute]=value.split(':').map(Number);
      const minutes=Array.from({length:12},(_,i)=>i*5);
      if(endpoint==='end'&&hour===23)minutes.push(59);
      if(!minutes.includes(minute))minutes.push(minute);
      minutes.sort((a,b)=>a-b);
      const pad=(n:number)=>String(n).padStart(2,'0');
      const change=(part:'hour'|'minute',event:Event)=>{
        const chosen=Number((event.target as HTMLSelectElement).value);
        const h=part==='hour'?chosen:hour;
        const m=part==='minute'?chosen:Math.floor(minute/5)*5;
        const requested=parseTime(`${pad(h)}:${pad(m)}`);
        // Keep the requested anchor; the live selectors display its resolved
        // clamp, including off-grid solar minima, until the popup is applied.
        p[endpoint]=time(requested);
        this.requestUpdate();
      };
      return html`<div class="fixed-time" role="group" aria-label=${`${label} time`}><select aria-label=${`${label} hour`} .value=${live(pad(hour))} @change=${(e:Event)=>change('hour',e)}>${Array.from({length:24},(_,h)=>html`<option value=${pad(h)} ?selected=${h===hour}>${pad(h)}</option>`)}</select><span aria-hidden="true">:</span><select aria-label=${`${label} minute`} .value=${live(pad(minute))} @change=${(e:Event)=>change('minute',e)}>${minutes.map(m=>html`<option value=${pad(m)} ?selected=${m===minute}>${pad(m)}</option>`)}</select></div>`;
    };
    return html`<div class="backdrop"><div class=${`dialog popup-${p.kind}`} role="dialog" aria-modal="true" aria-label=${p.kind==='away'?'Away mode':'Schedule editor'} @keydown=${(e:KeyboardEvent)=>{if(e.key==='Escape'&&!this.busy){this.popup=undefined;}if(e.key==='Tab'){const controls=Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>('.dialog button:not(:disabled),.dialog input:not(:disabled),.dialog select:not(:disabled)')).filter(node=>!(node instanceof HTMLInputElement&&node.type==='radio'&&!node.checked));const index=controls.indexOf(this.shadowRoot!.activeElement as HTMLElement);if(e.shiftKey&&index===0){controls.at(-1)?.focus();e.preventDefault();}else if(!e.shiftKey&&index===controls.length-1){controls[0]?.focus();e.preventDefault();}}}}><form @submit=${this.applyPopup}>
      <h3>${p.kind==='name'?'New schedule':p.kind==='entities'?'Add entity':p.kind==='temperature'?'Edit temperature':p.kind==='state'?'Edit state':p.kind==='band'?'Time band':p.kind==='category'?'Schedule category':p.kind==='filters'?'Filter schedules':p.kind==='away'?'Away mode':'Sub-schedules'}</h3>
      ${p.kind==='away'?html`<p class="away-help">Starts now. Choose when normal scheduling resumes.</p><label class=${`away-choice ${p.mode==='now'?'chosen':''}`}><input type="radio" name="away-duration" aria-label="Away now" .checked=${p.mode==='now'} @change=${()=>{p.mode='now';this.requestUpdate();}}><span><strong>Now</strong><small>Until I turn it off</small></span></label><label class=${`away-choice ${p.mode==='until'?'chosen':''}`}><input type="radio" name="away-duration" aria-label="Away until" .checked=${p.mode==='until'} @change=${()=>{p.mode='until';this.requestUpdate();}}><span><strong>Until…</strong><small>Return automatically</small></span></label>${p.mode==='until'?html`<label>Return date and time<input aria-label="Away return date and time" required type="datetime-local" step="60" min=${localDateTime(this.saved!.timezone,new Date(Date.now()+60000))} .value=${live(p.until)} @input=${(e:Event)=>{p.until=(e.target as HTMLInputElement).value;}}></label><p class="away-timezone">Times use ${this.saved!.timezone}.</p>`:nothing}${this.saved!.model.away?html`<button type="button" class="away-off" ?disabled=${this.busy} @click=${async()=>{if(await this.away(false))this.popup=undefined;}}>Turn Away off</button>`:nothing}`:nothing}
      ${p.kind==='name'?html`<label>Name<input autofocus required aria-label="Schedule name" .value=${p.value} @input=${(e:Event)=>{p.value=(e.target as HTMLInputElement).value;}}></label>`:nothing}
      ${p.kind==='temperature'?html`${numeric(p.target?'Target':'Shared setback','value',p.value)}${!p.target?html`<p>Shared across schedules for this entity.</p>`:nothing}<p>Range ${cap?.min}–${cap?.max}; step ${cap?.step}. Unavailable devices use cached capabilities.</p>`:nothing}
      ${p.kind==='state'?stateField(p.start?'Start state':'Stop state',p.value,v=>{p.value=v;}):nothing}
      ${p.kind==='entities'?html`<label>Search<input aria-label="Search entities" .value=${p.query} @input=${(e:Event)=>{this.popup={...p,query:(e.target as HTMLInputElement).value};}}></label><div class="choices">${this.caps.filter(c=>c.supported&&!this.draft!.section.entities.some(m=>this.draft!.settings[m.entity_key].entity_id===c.entity_id)&&(c.name+' '+c.entity_id).toLowerCase().includes(p.query.toLowerCase())).map(c=>html`<button type="button" class=${p.selected===c.entity_id?'selected':''} ?disabled=${!c.available} @click=${()=>this.chooseEntity(c)}>${c.name}<small>${c.entity_id}${!c.available?' · Unavailable':''}</small></button>`)}</div>${cap?cap.entity_id.startsWith('climate.')?html`${numeric('Target','target',p.target)}${numeric('Shared setback','setback',p.setback,!!Object.values(this.draft!.settings).find(s=>s.entity_id===cap.entity_id))}<p>Existing climate entities reuse their shared setback.</p>`:html`${stateField('Start state',p.start,v=>{p.start=v;})}${stateField('Stop state',p.end,v=>{p.end=v;})}`:nothing}`:nothing}
      ${p.kind==='band'?html`${p.reason?html`<p>${p.reason}</p>`:nothing}${p.band?.one_off?html`<p class="one-off-details"><ha-icon icon="mdi:calendar-clock" aria-hidden="true"></ha-icon><strong>One-off</strong></p>`:nothing}<fieldset><div class="band-times">${(['start','end'] as const).map(endpoint=>{
        const label=endpoint==='start'?'Start':'Stop',field=`${endpoint}_dynamic` as const,dynamic=p[field];
        const minute=endpoint==='start'?resolved?.[0]:displayedStop;
        const predicted=predictedMinute(dynamic,this.solarFor(previewSub));
        const prediction=predicted===undefined?'Unavailable':`${time((predicted%1440+1440)%1440)} *${predicted<0?' (previous day)':predicted>=1440?' (next day)':''}`;
        const requested=dynamic?predicted:parseTime(p[endpoint]);
        const changed=(p.start_dynamic||p.end_dynamic)&&requested!==undefined&&minute!==undefined&&Number.isFinite(minute)&&minute!==requested;
        const matchesStart=endpoint==='end'&&changed&&resolved&&Math.max(0,Math.min(1440,requested!))<resolved[0];
        return html`<div class="band-endpoint">
          <label>${label}${dynamic?html`<select aria-label=${`${label} solar event`} .value=${dynamic.event} @change=${(e:Event)=>{dynamic.event=(e.target as HTMLSelectElement).value;this.requestUpdate();}}>${solarEvents.map(([event,name])=>html`<option value=${event} ?selected=${dynamic.event===event}>${name}</option>`)}</select>`:fixedTime(endpoint,label)}</label>
          <label class="filter-check"><input type="checkbox" aria-label=${`${label} solar event`} .checked=${!!dynamic} @change=${(e:Event)=>{p[field]=(e.target as HTMLInputElement).checked?{event:endpoint==='start'?'sunrise':'sunset',offset:0}:undefined;this.requestUpdate();}}>Solar event</label>
          ${dynamic?html`<label>Offset (minutes)<input aria-label=${`${label} offset minutes`} type="number" required min="-300" max="300" step="1" .value=${String(dynamic.offset)} @input=${(e:Event)=>{dynamic.offset=Number((e.target as HTMLInputElement).value);this.requestUpdate();}}></label><output class="endpoint-preview" aria-label=${`${label} resolved time`} aria-live="polite">${prediction}</output>`:nothing}
          ${changed?html`<output class="endpoint-clamp" aria-label=${`${label} band time`} aria-live="polite">Band time: ${time(minute!)}${dynamic?' *':''}</output>${matchesStart?html`<small class="endpoint-clamp">Stop matches start</small>`:nothing}`:nothing}
        </div>`;
      })}</div>${p.start_dynamic||p.end_dynamic?html`<p class="band-preview-date">Times for ${previewDate}</p>`:nothing}<p class="band-help">Five-minute steps. Stop 23:59 means midnight.</p>
      ${!(p.band?.one_off||p.one_off)?html`<label>Band status<select aria-label="Band status" .value=${p.disabled?'disabled':'enabled'} @change=${(e:Event)=>{p.disabled=(e.target as HTMLSelectElement).value==='disabled';this.requestUpdate();}}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
      ${p.disabled?html`<label>Disable for<select aria-label="Disable for" .value=${p.disableMode??'permanent'} @change=${(e:Event)=>{p.disableMode=(e.target as HTMLSelectElement).value as 'permanent'|'until';this.requestUpdate();}}><option value="permanent">Permanent</option><option value="until">Until…</option></select></label>
      ${p.disableMode==='until'?html`<label>Re-enable date and time<input aria-label="Re-enable date and time" type="datetime-local" .value=${p.until?(p.until.includes('+')||p.until.endsWith('Z')?localDateTime(this.saved!.timezone,new Date(p.until)):p.until):''} min=${localDateTime(this.saved!.timezone)} @input=${(e:Event)=>{p.until=(e.target as HTMLInputElement).value;}}></label>`:nothing}`:nothing}
      <p>Disabled bands are skipped. Enabling an active band runs its start settings. Apply, then Save.</p>`:nothing}</fieldset>${!p.band?html`<div class="one-off-option"><label class="filter-check"><input type="checkbox" aria-label="One-off" aria-describedby="one-off-help" .checked=${!!p.one_off} @change=${(e:Event)=>{p.one_off=(e.target as HTMLInputElement).checked;if(p.one_off)p.disabled=false;this.requestUpdate();}}>One-off</label><p id="one-off-help">Will be removed once complete</p></div>`:nothing}`:nothing}
      ${p.kind==='sub-disable'?html`<label>Sub-schedule status<select aria-label="Sub-schedule status" .value=${!p.disabled?'enabled':p.disableMode} @change=${(e:Event)=>{const value=(e.target as HTMLSelectElement).value;p.disabled=value!=='enabled';p.disableMode=value==='until'?'until':'permanent';this.requestUpdate();}}><option value="enabled">Enabled</option><option value="permanent">Disabled permanently</option><option value="until">Disabled until…</option></select></label>${p.disabled&&p.disableMode==='until'?html`<label>Re-enable date and time<input aria-label="Re-enable date and time" required type="datetime-local" .value=${p.until?(p.until.includes('+')||p.until.endsWith('Z')?localDateTime(this.saved!.timezone,new Date(p.until)):p.until):''} min=${localDateTime(this.saved!.timezone)} @input=${(e:Event)=>{p.until=(e.target as HTMLInputElement).value;}}></label><p>Times use ${this.saved!.timezone}.</p>`:nothing}<p>Disabled sub-schedules skip all band transitions and leave devices unchanged. Apply, then Save.</p>`:nothing}
      ${p.kind==='subs'?html`<div class="choices">${this.draft!.section.sub_schedules.map((sub,i)=>html`<button type="button" class=${i===this.draft!.selected?'selected':''} @click=${()=>{this.draft!.selected=i;this.changed();this.popup=undefined;}}>${this.subLabel(sub,i)}: ${sub.days.map(d=>days[d]).join(', ')||'No days yet'}</button>`)}</div>`:nothing}
      ${p.kind==='category'?html`<label>Category<select aria-label="Category" .value=${p.choice} @change=${(e:Event)=>{this.popup={...p,choice:(e.target as HTMLSelectElement).value};}}><option value="none" ?selected=${p.choice==='none'}>Unassigned</option>${categories([...this.saved!.model.schedules,this.draft!.section]).map(name=>html`<option value=${`category:${name}`} ?selected=${p.choice===`category:${name}`}>${name}</option>`)}<option value="new" ?selected=${p.choice==='new'}>Create new category…</option></select></label>${p.choice==='new'?html`<label>New category<input aria-label="New category" required .value=${p.name} @input=${(e:Event)=>{p.name=(e.target as HTMLInputElement).value;}}></label>`:nothing}`:nothing}
      ${p.kind==='filters'?this.filterFields(p):nothing}
      ${p.kind==='away'&&this.awayAction?html`<p role="status" class="away-progress">${this.awayAction==='on'?'Setting Away…':'Resuming active schedules…'}</p>`:nothing}${this.error?html`<p role="alert" class="error">${this.error}</p>`:nothing}<div class="popup-actions"><div class="tools"><button type="button" ?disabled=${this.busy} @click=${()=>{this.popup=undefined;this.error='';}}>Cancel</button><button class="save" type="submit" ?disabled=${this.busy}>${p.kind==='subs'?'Done':p.kind==='away'?this.saved!.model.away?'Update Away':'Enable Away':'Apply'}</button></div>${p.kind==='band'&&p.band?html`<button type="button" class="trash-button popup-trash" aria-label="Delete time band" title="Delete time band" @click=${async()=>{if(await this.removeBand(p.band!))this.popup=undefined;}}>${this.trashIcon()}</button>`:nothing}</div>
    </form></div></div>`;
  }
  private filterFields(p:Extract<Popup,{kind:'filters'}>){
    const options=filterOptions(this.saved!.model.schedules,this.saved!.locations);
    return (['categories','areas','floors','activity'] as const).map(key=>{
      const title={categories:'Categories',areas:'Areas',floors:'Floors',activity:'Running now'}[key];
      const values=options[key],selected=p.filters[key]??values.map(value=>value.value);
      const change=(option:FilterOption,checked:boolean)=>{p.filters[key]=checked?[...selected,option.value]:selected.filter(value=>value!==option.value);this.requestUpdate();};
      return html`<fieldset class="filter-options" data-filter=${key}><legend>${title}</legend><label class="filter-check"><input type="checkbox" aria-label=${`Select all ${key==='activity'?'statuses':key}`} .checked=${selected.length===values.length} .indeterminate=${selected.length>0&&selected.length<values.length} @change=${(e:Event)=>{p.filters[key]=(e.target as HTMLInputElement).checked?values.map(value=>value.value):[];this.requestUpdate();}}>Select all</label>${values.map(option=>html`<label class="filter-check"><input type="checkbox" aria-label=${option.label} .checked=${selected.includes(option.value)} @change=${(e:Event)=>change(option,(e.target as HTMLInputElement).checked)}>${option.label}</label>`)}</fieldset>`;
    });
  }
  protected updated(changes:Map<string,unknown>) {
    if(changes.has('draft'))this.shadowRoot?.querySelectorAll<LitElement>('hsm-timeline').forEach(t=>t.requestUpdate());
    if(changes.has('popup')&&this.popup)this.shadowRoot?.querySelector<HTMLElement>('.dialog input:not([type="radio"]),.dialog input[type="radio"]:checked,.dialog select,.dialog button')?.focus();
    if(changes.has('confirmation')&&this.confirmation)this.shadowRoot?.querySelector<HTMLElement>('.confirm button')?.focus();
    if(this.popup?.kind==='preview-subs')this.placePreviewOptions();
    if(this.peek){const section=this.saved?.model.schedules.find(schedule=>schedule.id===this.peek!.sectionId);const target=section?.sub_schedules.find(schedule=>schedule.id===this.peek!.subId);if(!target?.days.includes(this.peek.day)||target.days.includes(this.clock.day)||!this.shadowRoot?.querySelector(`[data-preview-scope="${this.peek.sectionId}"]`))this.hidePeek();}
    if(changes.has('saved')||changes.has('draft')||changes.has('clock')||changes.has('filters')||changes.has('collapsedCategories')||changes.has('peek')||changes.has('popup'))this.queueTimeLayout();
  }
  render() {
    if(!this.saved)return html`<ha-card><p>Loading Scheduling Manager…</p>${this.connectionMessage?html`<p role="status">${this.connectionMessage}</p>`:nothing}${this.error?html`<p role="alert">${this.error}</p>`:nothing}</ha-card>`;
    const title=viewTitle(this);
    const options=filterOptions(this.saved.model.schedules,this.saved.locations);
    const filters=normalizeFilters(this.filters,options),filtered=isFiltered(filters);
    const displayed=this.saved.model.schedules.map(section=>this.draft?.section.id===section.id?this.draft.section:section);
    if(this.draft?.isNew)displayed.push(this.draft.section);
    const sections=visibleSchedules(displayed,filters,this.saved.locations,this.saved.active_schedules,this.draft?.section.id);
    const groups=categoryGroups(sections,this.saved.active_schedules);
    const showAll=groups.every(group=>this.collapsedCategories.has(group.key));
    const returnLabel=this.saved.model.away_until?awayUntilLabel(this.saved.model.away_until,this.saved.timezone):'';
    return html`<ha-card><header><div class="header-heading">${title?html`<h2>${title}</h2>`:nothing}<div class="day-box">${this.clock.weekday}</div></div><span class="header-space" aria-hidden="true"></span><div class="category-controls"><button aria-label=${`${showAll?'Show':'Hide'} all categories`} ?disabled=${!groups.length} @click=${()=>this.setAllCategories(groups,!showAll)}>${showAll?'Show all':'Hide all'}</button></div><div class=${`filter-controls ${filtered?'filtered':''}`}>${filtered?html`<button class="remove clear-filter" aria-label="Clear schedule filters" @click=${()=>{this.filters=allFilters();}}>✕</button>`:nothing}<button class=${filtered?'selected':''} aria-label="Filter schedules" aria-pressed=${filtered} @click=${()=>{this.popup={kind:'filters',filters:Object.fromEntries(Object.entries(options).map(([key,values])=>[key,[...(filters[key as keyof ScheduleFilters]??values.map(value=>value.value))]])) as unknown as ScheduleFilters};}}>☷ Filter</button></div><button ?disabled=${!this.saved.editable||this.busy} @click=${async()=>{if(await this.discard())this.popup={kind:'name',value:''};}}>＋ Schedule</button><div class="away-control"><button class=${this.saved.model.away?'selected':'away'} aria-pressed=${this.saved.model.away} ?disabled=${!this.saved.editable||this.busy} title=${this.saved.model.away?returnLabel?`Away until ${returnLabel}`:'Away until you turn it off':'Set Away mode'} @click=${this.openAway}>Away</button>${returnLabel?html`<span class="away-return">Until ${returnLabel}</span>`:nothing}</div></header>
      ${this.connectionMessage?html`<p role="status">${this.connectionMessage}</p>`:nothing}
      ${this.error&&!this.popup?html`<p class="error" role="alert">${this.error}</p>`:nothing}
      ${this.saved.storage_error?html`<p class="error" role="alert">Storage: ${this.saved.storage_error}</p>`:nothing}
      ${this.saved.applying?html`<p class="device-progress" role="status">Updating devices…</p>`:nothing}
      ${this.draft&&this.draft.revision!==this.saved.model.revision?html`<p class="error" role="alert">Saved state changed elsewhere. Your unsaved changes are retained. Cancel and reopen to reload before saving.</p>`:nothing}
      ${groups.map(group=>this.categoryView(group))}
      ${!this.saved.model.schedules.length&&!this.draft?html`<p class="empty">Add a schedule to begin.</p>`:nothing}
      ${this.saved.model.schedules.length&&!sections.length&&!this.draft?html`<p class="empty">No schedules match this filter.</p>`:nothing}
      ${this.sharedTime?html`<div class="shared-time" role="img" aria-label=${`Current time ${time(this.clock.minute)}`} style=${`left:${this.sharedTime.left}px;top:${this.sharedTime.top}px;height:${this.sharedTime.height}px`}><span class="shared-time-label">${time(this.clock.minute)}</span><span class="shared-time-line"></span></div>`:nothing}
      ${this.draft&&draftError(this.draft,this.caps)?html`<p class="hint validation" role="status">${draftError(this.draft,this.caps)}</p>`:nothing}
      ${Object.values(this.saved.status).map(s=>html`<p class="error" role="status">${s.entity_id}: ${s.message}</p>`)}
      ${this.popupView()}
      ${this.confirmation?html`<div class="backdrop"><div class="dialog confirm" role="alertdialog" aria-modal="true" aria-label="Confirm action" @keydown=${(e:KeyboardEvent)=>{if(e.key==='Escape'){this.confirmation?.resolve(false);this.confirmation=undefined;}if(e.key==='Tab'){const controls=this.shadowRoot!.querySelectorAll<HTMLElement>('.confirm button');const at=Array.from(controls).indexOf(this.shadowRoot!.activeElement as HTMLElement);controls[(at+1)%2]?.focus();e.preventDefault();}}}><p>${this.confirmation.message}</p><div class="tools"><button @click=${()=>{this.confirmation?.resolve(false);this.confirmation=undefined;}}>No</button><button class="remove" @click=${()=>{this.confirmation?.resolve(true);this.confirmation=undefined;}}>Yes</button></div></div></div>`:nothing}
    </ha-card>`;
  }
  static styles=css`
    .one-off-option .filter-check{margin-bottom:0}.one-off-option #one-off-help{margin:2px 0 0}
    fieldset{border:0;padding:0;margin:0;min-width:0}.one-off-details{display:flex;align-items:center;gap:6px;font-size:14px}.one-off-details ha-icon{color:#e53935}
    :host{--orange:#ff861f;--blue:var(--info-color,#009edc);--green:var(--success-color,#23ad4b);--red:var(--error-color,#b71936);--timeline-min-width:600px;display:block;color:var(--primary-text-color,#222);font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}
    ha-card{display:block;position:relative;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:0;overflow:clip;padding-bottom:0}
    header{background:var(--app-header-background-color,var(--primary-color,#03a9f4));color:var(--primary-text-color,#222);display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:14px 12px 6px}.header-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}h2{font-size:22px;font-weight:500;margin:0}.header-space{flex:1}header button{font-size:12px;min-height:36px;padding:5px 9px;border-radius:5px}h3{margin-top:0}
    button,input{font:inherit}button{cursor:pointer;border:1px solid var(--divider-color,#666);border-radius:7px;min-height:44px;padding:6px 12px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222)}button:disabled{cursor:default;opacity:.6}button:focus-visible,input:focus-visible{outline:3px solid var(--primary-color,#009edc);outline-offset:2px}
    .selected,.add,.enable{background:var(--green);color:white}.away,.disable,.days button:not(.selected){background:var(--disabled-text-color,#777);color:white}.remove{background:var(--red);color:white}.save{border:2px solid var(--green)}
    .days button.enable{background:var(--green);color:white}
    .days .disabled-day,.view-days .view-day.disabled-day{background:#000;color:#fff;position:relative}.disabled-day::after{content:'×';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ff3030;font-size:38px;font-weight:300;line-height:1;pointer-events:none}
    .sub-disabled-until{font-size:12px;color:var(--secondary-text-color,#666);margin:4px 0 8px}
    .day-box{border:2px solid var(--primary-text-color,#111);border-radius:6px;font-size:20px;font-weight:500;text-align:center;box-sizing:border-box;min-width:112px;margin:0;padding:2px 10px}
    header{position:sticky;top:var(--header-height,0px);z-index:5}
    section{position:relative;display:grid;grid-template-columns:354px minmax(0,1fr);gap:0;border-bottom:2px solid var(--primary-text-color,#111);padding:0;align-items:stretch}section::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:2px;background:var(--primary-text-color,#111);z-index:2;pointer-events:none}
    .schedule-panel{position:relative;z-index:2;min-width:0;padding:6px 8px;background:var(--schedule-panel-background,color-mix(in srgb,var(--app-header-background-color,var(--primary-color,#03a9f4)) 55%,var(--card-background-color,#fff)));border:1px solid var(--primary-text-color,#111);border-bottom:0;box-sizing:border-box;display:flex;flex-direction:column}
    .category-watermark{position:absolute;z-index:0;top:42px;right:12px;max-width:45%;font-size:44px;font-weight:700;line-height:1.1;color:var(--secondary-text-color,#999);opacity:.25;pointer-events:none;overflow-wrap:anywhere;text-align:right}.timeline-region{position:relative;z-index:2}.edit-actions{display:flex;gap:5px;align-items:center;flex-wrap:nowrap;margin-bottom:6px}.edit-actions button{font-size:12px;padding:5px 7px;min-height:36px;white-space:nowrap}
    .section-meta{display:flex;gap:6px;align-items:center;flex-wrap:nowrap;min-height:36px;margin-bottom:6px}.name{background:transparent;border:0;border-radius:0;color:var(--primary-text-color,#222);font-size:22px;font-weight:500;text-align:left;min-width:0;flex:1;overflow-wrap:anywhere;padding:2px 3px}.name:disabled{opacity:1}.section-meta .tools{margin-left:auto;flex-wrap:nowrap}.section-meta .tools button{font-size:12px;padding:5px 8px;min-height:36px}.section-meta .tools .burger{font-size:21px;line-height:1;padding:5px 8px}
    .entities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.entity{display:flex;align-items:stretch;margin:0;gap:0;min-width:0}.entity span{flex:1;min-width:0;overflow-wrap:anywhere;border:2px solid var(--primary-text-color,#222);padding:5px 3px;text-align:center;font-size:12px;line-height:1.2;background:var(--ha-card-background,var(--card-background-color,#fff))}.entity button{font-size:11px;padding:4px 3px;min-width:34px;min-height:34px}.entity .setback,.entity .target{max-width:60px;overflow-wrap:anywhere}.entity .setback{background:var(--blue);color:#071820;border-radius:0 6px 6px 0;border:0}.entity .target{background:var(--orange);color:#221000;border-radius:6px 0 0 6px;border:0}.entity button:disabled{opacity:1}.entity .remove{border-radius:5px;min-width:28px;margin-left:3px;padding:3px}small{font-size:10px;display:block}.entity .target small,.entity .setback small{font-size:9px;display:inline}
    .editing .entities{grid-template-columns:repeat(2,minmax(0,1fr))}.editing .entity span{font-size:11px}.editing .entity button{min-width:28px;min-height:34px;padding:4px 2px}.editing .entity .trash-button{min-width:24px;padding:2px;margin-left:1px}.trash-icon{display:block;width:20px;height:20px;flex-shrink:0}.trash-button{background:transparent;color:var(--secondary-text-color,#666);border:0;border-radius:5px;display:grid;place-items:center;cursor:pointer}.trash-button:hover{color:var(--error-color,#b71936);background:color-mix(in srgb,var(--error-color,#b71936) 10%,transparent)}.section-trash{min-width:36px;padding:6px}.section-trash .trash-icon{width:24px;height:24px}.entity-trash .trash-icon{width:15px;height:15px}
    .edit-footer{margin-top:auto;padding-top:32px}.edit-bottom{display:flex;gap:6px;align-items:center;justify-content:space-between}.edit-bottom .tools{flex-wrap:nowrap;gap:4px}.edit-bottom button{font-size:11px;min-height:32px;padding:5px 7px}.edit-bottom .category-button{max-width:55%;overflow-wrap:anywhere}.edit-actions{padding-bottom:4px}.edit-actions button{font-size:11px;min-height:32px}
    .view-days{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin:0 0 4px}.view-day{display:inline-block;border-radius:5px;padding:4px 6px;font-size:11px;font-weight:600;line-height:1.2}.view-day.active{background:color-mix(in srgb,var(--green) 28%,var(--card-background-color,#fff));color:var(--primary-text-color,#222)}.view-day.inactive{background:var(--disabled-text-color,#777);color:white}
    .view-sub-number{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:26px;height:26px;min-height:26px;padding:0;border:0;margin-left:4px;border-radius:50%;font-size:11px;font-weight:600;line-height:1.2;color:var(--primary-text-color,#222);background:color-mix(in srgb,var(--green) 28%,var(--card-background-color,#fff))}.view-sub-number.preview{background:var(--disabled-text-color,#777);color:white}
    .view-sub-number.named{width:auto;height:auto;min-height:26px;max-width:100%;box-sizing:border-box;border-radius:6px;padding:5px 8px;flex-shrink:1;overflow-wrap:anywhere}
    .view-day{border:2px solid transparent;box-sizing:border-box}.view-day.inactive,.view-day.active{min-height:0;min-width:0;cursor:pointer}.view-day.unscheduled{background:#fff;color:#000;border-color:#000;cursor:default}.view-day.previewed{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue)}.peek-timeline{position:relative}.timeline-region{position:relative}.peek-timeline.status-preview{position:absolute;left:8px;right:8px;bottom:0}.empty.peek-status{color:#ddd;pointer-events:none}
    .shared-time{position:absolute;width:0;pointer-events:none}.shared-time-label{position:absolute;z-index:3;left:0;top:0;transform:translateX(-50%);box-sizing:border-box;width:64px;height:30px;display:grid;place-items:center;border:2px solid var(--orange);border-radius:8px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--orange);font-size:16px;font-weight:700}.shared-time-line{position:absolute;z-index:1;top:30px;bottom:0;left:-1.75px;width:3.5px;background:var(--orange)}.clear-filter{min-width:36px;padding:5px 8px}
    .filter-controls{display:inline-flex;gap:0;flex-shrink:0;align-items:stretch}.filter-controls.filtered .clear-filter{border-radius:5px 0 0 5px}.filter-controls.filtered button:last-child{border-radius:0 5px 5px 0}
    .category-controls button,.filter-controls button:not(.selected):not(.remove){background:transparent;border-color:color-mix(in srgb,currentColor 35%,transparent)}.away-control{margin-inline-start:8px;display:grid;justify-items:end;gap:2px}.away-return{font-size:11px;max-width:220px;text-align:right;overflow-wrap:anywhere}
    header button.away{background:color-mix(in srgb,var(--disabled-text-color,#777) 40%,var(--card-background-color,#fff));color:var(--primary-text-color,#222)}
    .category-controls{display:flex;gap:4px}.category-heading{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;min-height:48px;border-radius:0;border:0;border-top:1px solid var(--divider-color,#777);border-bottom:1px solid var(--divider-color,#777);padding:8px 12px;background:var(--secondary-background-color,#eee);position:relative;z-index:3}.category-heading.running{background:color-mix(in srgb,var(--green) 12%,var(--card-background-color,#fff))}.category-activity{text-align:left;font-size:13px;font-weight:500;flex-shrink:0}.category-title{margin-left:auto;text-align:right;font-size:18px;font-weight:700;overflow-wrap:anywhere;min-width:0}.category-arrow{flex:0 0 24px;width:24px;height:24px;display:flex;align-items:center;justify-content:center}.category-arrow svg{display:block;width:24px;height:24px;transform-origin:center}.category-arrow svg.expanded{transform:rotate(180deg)}.category-content[hidden]{display:none}
    .entity-list{min-height:0}.entity-list.overflowing{max-height:180px;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;overscroll-behavior-y:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}.entity-list:focus-visible{outline:2px solid var(--blue);outline-offset:2px}.entity-scroll-controls{display:flex;gap:4px;align-items:center;justify-content:flex-end;margin-bottom:4px}.entity-scroll-controls span{margin-right:auto;font-size:11px}.entity-scroll-controls button{min-height:28px;min-width:32px;padding:2px 6px;font-size:18px;line-height:1}
    .timeline-region{min-width:0;padding:8px 8px 0}.empty{font-size:25px;font-weight:bold;text-align:center;color:var(--secondary-text-color,#777);padding:25px}.tools,.days{display:flex;gap:6px;flex-wrap:wrap}.days button{padding:6px 9px}.hint{font-size:12px;color:var(--secondary-text-color,#666);line-height:1.5;margin:10px 14px}.error{margin:12px;color:var(--error-color,#b71936);overflow-wrap:anywhere}.validation{font-size:14px}
    .add-band{margin-bottom:8px}.sub-selector{font:inherit;min-height:44px;min-width:64px;max-width:220px;padding:6px 8px;border:1px solid var(--divider-color,#777);border-radius:7px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222)}
    .sub-name{display:block;font-size:12px;margin:8px 0;max-width:300px}.sub-name input{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:8px;border:1px solid var(--divider-color,#777);border-radius:6px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222)}
    .backdrop{position:fixed;inset:0;z-index:1000;background:#0007;display:flex;align-items:center;justify-content:center;padding:12px}.dialog{background:var(--card-background-color,#fff);color:var(--primary-text-color,#222);border-radius:12px;padding:16px;box-sizing:border-box;max-width:320px;width:100%;max-height:85dvh;overflow:auto}.dialog.popup-band{max-width:300px;padding-bottom:20px}.dialog.popup-temperature,.dialog.popup-state,.dialog.popup-subs{max-width:280px}.dialog.popup-entities{max-width:380px}.dialog label{display:block;margin:10px 0}.dialog input,.dialog select{font:inherit;display:block;box-sizing:border-box;width:100%;padding:10px;background:var(--secondary-background-color,#eee);color:inherit;border:1px solid var(--divider-color,#777);border-radius:6px}.choices{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto}.choices button{text-align:left}.dialog p{font-size:14px;line-height:1.5}.band-times{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.dialog .band-help{margin:8px 0 20px}.popup-actions{display:flex;gap:8px;align-items:center;justify-content:space-between}.popup-trash{min-width:44px;min-height:44px;color:var(--error-color,#b71936);margin-left:auto;padding:8px}
    .filter-options{border:1px solid var(--divider-color,#777);border-radius:7px;max-height:260px;overflow:auto;padding:8px 12px}.dialog .filter-check{display:flex;align-items:center;gap:10px;min-height:36px;margin:4px 0;cursor:pointer}.dialog .filter-check input{display:inline-block;width:18px;height:18px;flex:0 0 18px;margin:0;padding:0;accent-color:var(--primary-color,#03a9f4)}
    .dialog .away-choice{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--divider-color,#777);border-radius:7px;cursor:pointer}.dialog .away-choice.chosen{border-color:var(--green);background:color-mix(in srgb,var(--green) 10%,var(--card-background-color,#fff))}.dialog .away-choice input{width:18px;height:18px;flex-shrink:0;margin:0;accent-color:var(--green)}.away-choice small{font-size:12px;margin-top:3px}.dialog .away-help{font-size:13px;line-height:1.4}.dialog .away-timezone{font-size:12px;color:var(--secondary-text-color,#777)}.away-off{margin:6px 0;background:var(--secondary-background-color,#eee)}
    .away-progress,.device-progress{font-size:13px;color:var(--secondary-text-color,#777)}.device-progress{margin:6px 12px}
    .disabled-placeholder{visibility:hidden}.disabled-label{position:absolute;top:42px;left:0;right:0;text-align:center;color:#aaa}.empty.disabled-empty{margin:0;padding:0;height:56px}
    .disabled-schedule .view-day.active,.disabled-schedule .view-day.inactive,.disabled-schedule .view-sub-number{background:#aaa;color:#333}
    .disabled-schedule .entity .target,.disabled-schedule .entity .setback{background:#aaa;color:#333}.disabled-schedule .entity>span{background:#eee;color:#666;border-color:#aaa}
    .endpoint-preview{display:block;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}.endpoint-clamp{display:block;font-size:12px;color:var(--secondary-text-color,#777);margin-top:4px}.dialog .band-preview-date{margin:8px 0;font-size:12px;color:var(--secondary-text-color,#777)}
    .fixed-time{display:flex;align-items:center;gap:3px}.dialog .fixed-time select{min-width:0;flex:1;padding:10px 3px;font-variant-numeric:tabular-nums}
    section.preview-open{z-index:4}.preview-selection{position:relative;display:grid;align-self:flex-start;min-width:0;max-width:100%}.preview-selection>.view-sub-number{grid-area:1/1;justify-self:start}.preview-size{grid-area:1/1;display:grid;visibility:hidden;pointer-events:none;min-width:26px;min-height:26px;box-sizing:border-box;max-width:100%;margin-left:4px;padding:5px 8px;font-size:11px;font-weight:600;line-height:1.2}.preview-size>span{grid-area:1/1;min-width:0;overflow-wrap:anywhere}.preview-options{position:absolute;z-index:5;top:calc(100% + 4px);left:4px;display:flex;flex-direction:column;gap:4px;margin:0;padding:5px;border:1px solid var(--divider-color,#777);border-radius:6px;background:var(--ha-card-background,var(--card-background-color,#fff));width:max-content;max-width:260px;max-height:120px;overflow:auto;box-sizing:border-box;box-shadow:0 3px 10px #0003}.preview-options button{text-align:left;font-size:11px;padding:6px 8px;overflow-wrap:anywhere;flex-shrink:0}.preview-options>span{font-size:11px;padding:6px}
     @media(max-width:850px){:host{--timeline-min-width:900px}section{grid-template-columns:1fr}.schedule-panel{border-bottom:1px solid var(--primary-text-color,#111)}.timeline-region{padding:8px;grid-column:1}.category-watermark{top:auto;bottom:116px;max-width:55%}.disabled-schedule .category-watermark{bottom:12px;max-width:40%}.disabled-label{top:52px;left:12px;right:50%;text-align:left}.empty.disabled-empty{height:68px}.header-heading{flex-basis:100%}header .header-space{display:none}.entity span{font-size:13px}.entity button{min-height:40px}.section-meta .tools button,header button{min-height:40px}.editing .entity button{min-height:44px}}
    @media(max-width:420px){header{padding:10px 8px 6px}.entities{gap:4px}.entity button{min-width:30px;padding:4px 2px}.entity .remove{min-width:28px}.name{font-size:20px}.days{gap:4px}.days button{padding:6px 8px}}
  `;
}
if(!customElements.get('scheduling-manager-card'))customElements.define('scheduling-manager-card',SchedulingManagerCard);
// Keep existing dashboards/resources compatible while the visible project name changes.
(window as any).customCards=(window as any).customCards??[];
if(!(window as any).customCards.some((card:{type:string})=>card.type==='scheduling-manager-card'))(window as any).customCards.push({type:'scheduling-manager-card',name:'Scheduling Manager',description:'Shared schedules with temperature and state editing.'});

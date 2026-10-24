import {LitElement, html, svg, css, nothing} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {Band, SolarMinutes, Sub} from './types';
import {bandError, clampEndpoint, snap, time} from './draft';
import {resolvedBand} from './dynamic';
import {bandDisabled} from './bands';

type Endpoint='start_minute'|'end_minute';
type Marker={key:string;band:Band;endpoint:Endpoint};

export class SchedulingTimeline extends LitElement {
  static properties = {sub: {attribute: false},solarMinutes:{attribute:false},previewSolarMinutes:{attribute:false}, previewSub:{attribute:false},previewDay:{type:String},edit: {type: Boolean}, minute: {type: Number}, showCurrentTime:{type:Boolean},canvasWidth: {state:true},activeMarker:{state:true}};
  sub: Sub = {id: '', days: [], bands: []};
  previewSub?:Sub;
  previewDay='';
  solarMinutes?:SolarMinutes;
  previewSolarMinutes?:SolarMinutes;
  edit = false;
  minute = 0;
  showCurrentTime=true;
  private canvasWidth = 900;
  private resize?: ResizeObserver;
  private activeMarker?:string;
  private hold?: ReturnType<typeof setTimeout>;
  private tap?: ReturnType<typeof setTimeout>;
  private lastTap?: {id: string; at: number};
  private gesture?: {x: number; y: number; minute: number; band?: Band; endpoint?: Endpoint; moved: boolean; id: number;overlap?:boolean;candidates?:string[];previous?:string;key?:string};
  static styles = css`
    :host {display:block;overflow-x:auto;overscroll-behavior-x:contain;}
    svg {width:100%;min-width:var(--timeline-min-width,900px);height:150px;display:block;touch-action:pan-x pan-y;color:var(--primary-text-color,#222);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
    line,path {vector-effect:non-scaling-stroke} text {font:12px sans-serif;fill:currentColor}
    .marker {cursor:pointer;touch-action:pan-x pan-y;outline:none}svg.editing .marker{touch-action:none}.marker:focus path,.marker.selected path {stroke:var(--primary-text-color,#222);stroke-width:3}
    .start {fill:var(--orange,#ff861f)} .end {fill:var(--blue,#009edc)}
    .marker.disabled path{fill:#555}.disabled-band{color:#555}.disabled-label{fill:#555;font-weight:700;paint-order:stroke;stroke:var(--card-background-color,#fff);stroke-width:3px}
    .marker.one-off path,.marker.one-off:focus path,.marker.one-off.selected path{stroke:#e53935;stroke-width:2.5}.one-off-badge{pointer-events:none}.one-off-badge circle{fill:var(--ha-card-background,var(--card-background-color,#fff));stroke:#e53935;stroke-width:2}.one-off-badge ha-icon{display:block;width:24px;height:24px;line-height:0;--mdc-icon-size:24px;--ha-icon-size:24px;color:#e53935;transform:scale(.5833333333);transform-origin:top left}.ghost-preview .one-off-preview .ghost-marker{stroke:#e53935}
    .current-label rect{fill:var(--ha-card-background,var(--card-background-color,#fff));stroke:var(--orange,#ff861f);stroke-width:2}
    .current-label text{fill:var(--orange,#ff861f);font-weight:700;font-size:16px}
    .marker-tools{display:flex;gap:6px;margin:4px 0;min-height:44px;flex-wrap:wrap}button{font:inherit;min-height:44px;padding:6px 12px;border:1px solid var(--divider-color,#777);border-radius:7px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222);cursor:pointer}button:focus-visible{outline:3px solid var(--primary-color,#03a9f4)}
    @media(max-width:850px){.odd{display:none}}
    svg.compact .axis-label{font-size:8px}
    .active-schedule.dimmed{opacity:.25}.ghost-preview{pointer-events:none}.ghost-connector{stroke:var(--blue,#009edc);stroke-dasharray:7 5;stroke-width:2}.ghost-marker{fill:none;stroke-width:2;stroke-dasharray:4 3}.ghost-marker.start{stroke:var(--orange,#ff861f)}.ghost-marker.end{stroke:var(--blue,#009edc)}.ghost-preview text{fill:var(--primary-text-color,#222);font-weight:700}.ghost-caption{font-size:12px}
    .disabled-preview .ghost-marker,.disabled-preview .ghost-connector{stroke:#555}.disabled-preview .disabled-label{fill:#555}
    .disabled-preview .ghost-marker{fill:#555;fill-opacity:.15}
  `;
  private emit(name: string, detail: unknown) { this.dispatchEvent(new CustomEvent(name, {detail, bubbles: true, composed: true})); }
  private disabled(band:Band,sub:Sub=this.sub):boolean {const now=Date.now();return bandDisabled(sub,now)||bandDisabled(band,now);}
  private oneOffBadge(center:number) {return svg`<g class="one-off-badge" transform=${`translate(${center} 16) scale(1.3)`} role="img" aria-label="One-off time band"><circle r="10"/><foreignObject x="-7" y="-7" width="14" height="14">${html`<ha-icon icon="mdi:calendar-clock" aria-hidden="true"></ha-icon>`}</foreignObject></g>`;}
  private position(event: MouseEvent): number {
    const canvas = this.shadowRoot!.querySelector('svg')!;
    const matrix = canvas.getScreenCTM();
    if (!matrix) return 0;
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    return (point.x - 40) / (this.canvasWidth - 80) * 1440;
  }
  private doubleClick(event:MouseEvent) {
    if(!this.edit||event.button!==0)return;
    const start=Math.max(0,Math.min(1440,snap(this.position(event))));
    const hit=Array.from(this.shadowRoot!.querySelectorAll('.hit-area')).some(node=>{const rect=node.getBoundingClientRect();return event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;});
    if(hit||this.sub.bands.some(b=>start>=b.start_minute&&start<=b.end_minute))return;
    clearTimeout(this.hold);clearTimeout(this.tap);this.gesture=undefined;this.lastTap=undefined;
    event.preventDefault();
    this.emit('band-add',{start,end:start+60,reason:bandError(this.sub,start,start+60),method:'doubleclick'});
  }
  private markers():Marker[] {return this.sub.bands.filter(band=>resolvedBand(band,this.solarMinutes)).flatMap(band=>(['start_minute','end_minute'] as const).map(endpoint=>({key:`${band.id}:${endpoint}`,band,endpoint})));}
  private promote(key:string,focus=false) {
    this.activeMarker=key;
    if(focus)void this.updateComplete.then(()=>this.shadowRoot?.querySelector<SVGGElement>(`[data-marker="${key}"]`)?.focus());
  }
  private markerHits(event:PointerEvent,key:string) {
    const nodes=Array.from(this.shadowRoot!.querySelectorAll<SVGGElement>('g.marker'));
    const boxes=nodes.map(node=>({key:node.dataset.marker!,rect:node.querySelector('.hit-area')!.getBoundingClientRect()}));
    const current=boxes.find(box=>box.key===key)!;
    const overlap=boxes.some(box=>box.key!==key&&current.rect.left<box.rect.right&&current.rect.right>box.rect.left&&current.rect.top<box.rect.bottom&&current.rect.bottom>box.rect.top);
    const candidates=boxes.filter(box=>event.clientX>=box.rect.left&&event.clientX<=box.rect.right&&event.clientY>=box.rect.top&&event.clientY<=box.rect.bottom).map(box=>box.key).reverse();
    return {overlap,candidates};
  }
  private down(event: PointerEvent, band?: Band, endpoint?: Endpoint) {
    if (event.button !== 0 || (!this.edit&&!band)) return;
    const minute = Math.max(0, Math.min(1440, snap(this.position(event))));
    if (!band && this.sub.bands.some(b => minute >= b.start_minute - 15 && minute <= b.end_minute + 15)) return;
    const key=band&&endpoint?`${band.id}:${endpoint}`:undefined;
    const hit=key?this.markerHits(event,key):{};
    this.gesture = {x:event.clientX,y:event.clientY,minute,band,endpoint,moved:false,id:event.pointerId,key,previous:this.activeMarker,...hit};
    if (band) {
      event.preventDefault(); event.stopPropagation();
      this.shadowRoot!.querySelector('svg')!.setPointerCapture(event.pointerId);
      if(key)this.promote(key);
    } else {
      this.hold = setTimeout(() => {
        this.gesture = undefined;
        this.emit('band-add', {start: minute, end: minute + 60, reason: bandError(this.sub, minute, minute + 60)});
      }, 600);
    }
  }
  private move(event: PointerEvent) {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (Math.hypot(event.clientX-g.x, event.clientY-g.y) > 8) {g.moved = true; clearTimeout(this.hold);}
    if (this.edit && g.band && g.endpoint && !(g.endpoint==='start_minute'?g.band.start_dynamic:g.band.end_dynamic) && g.moved) {
      clearTimeout(this.tap); this.lastTap = undefined;
      g.band[g.endpoint] = clampEndpoint(this.sub, g.band, g.endpoint, this.position(event),this.solarMinutes);
      if(g.band.one_off_run)delete g.band.one_off_run.minutes;
      this.requestUpdate(); this.emit('band-change', {});
    }
  }
  private up(event: PointerEvent) {
    clearTimeout(this.hold);
    const g = this.gesture; this.gesture = undefined;
    if (!g?.band || g.moved) return;
    if(this.edit&&(g.band.start_dynamic||g.band.end_dynamic||!g.endpoint)){
      // Finish the touch's synthetic click before placing a dialog under it.
      if(event.pointerType==='touch')this.tap=setTimeout(()=>this.emit('band-edit',g.band),0);
      else this.emit('band-edit',g.band);
      return;
    }
    if(g.overlap||!this.edit){
      clearTimeout(this.tap);this.lastTap=undefined;
      const candidates=g.candidates??[];
      const index=candidates.indexOf(g.previous??'');
      const key=index>=0&&g.previous===g.key&&candidates.length>1?candidates[(index+1)%candidates.length]:g.key;
      if(key)this.promote(key);
      return;
    }
    const at = Date.now();
    if (this.lastTap?.id === g.band.id && at-this.lastTap.at < 320) {
      clearTimeout(this.tap); this.lastTap = undefined; this.emit('band-delete', g.band);
    } else {
      this.lastTap = {id: g.band.id, at};
      this.tap = setTimeout(() => { this.lastTap = undefined; this.emit('band-edit', g.band); }, 320);
    }
  }
  private cancel() {clearTimeout(this.hold); this.gesture = undefined;}
  connectedCallback() {
    super.connectedCallback();
    this.resize = new ResizeObserver(entries=>{
      const minimum=parseFloat(getComputedStyle(this).getPropertyValue('--timeline-min-width'))||900;
      this.canvasWidth=Math.max(minimum,entries[0].contentRect.width);
    });
    this.resize.observe(this);
  }
  disconnectedCallback() {super.disconnectedCallback(); this.resize?.disconnect(); this.cancel(); clearTimeout(this.tap);}
  protected firstUpdated() {
    const canvas=this.shadowRoot!.querySelector('svg')!;
    if(!this.edit&&canvas.clientWidth>this.clientWidth){
      this.scrollLeft=40+this.minute/1440*(this.canvasWidth-80)-this.clientWidth/2;
    }
  }
  protected updated(changes:Map<string,unknown>) {
    if(changes.has('canvasWidth')||changes.has('sub')||changes.has('solarMinutes'))this.emit('timeline-layout',{});
  }
  render() {
    const x = (minute: number) => 40 + minute / 1440 * (this.canvasWidth - 80);
    const markers=this.markers();
    markers.sort((a,b)=>Number(a.key===this.activeMarker)-Number(b.key===this.activeMarker));
    const selected=markers.find(marker=>marker.key===this.activeMarker);
    const unavailable=this.sub.bands.filter(band=>!resolvedBand(band,this.solarMinutes));
    return html`<svg class=${`${this.edit?'editing ':''}${this.canvasWidth<760?'compact':''}`} viewBox=${`0 0 ${this.canvasWidth} 150`} aria-label="Daily schedule, 00:00 to end of day midnight" @dblclick=${this.doubleClick} @contextmenu=${(e:Event)=>e.preventDefault()} @pointerdown=${(e:PointerEvent)=>this.down(e)} @pointermove=${this.move} @pointerup=${this.up} @pointercancel=${this.cancel} @pointerleave=${()=>{if(!this.gesture?.band)this.cancel();}}>
      <line class="axis" x1="40" y1="108" x2=${this.canvasWidth-40} y2="108" stroke="currentColor" stroke-width="3"/>
      ${Array.from({length:25},(_,hour)=>svg`<line x1=${x(hour*60)} y1="100" x2=${x(hour*60)} y2="117" stroke="currentColor"/><text class=${`axis-label ${hour%2?'odd':''}`} x=${x(hour*60)} y="141" text-anchor="middle">${time(hour*60)}</text>`)}
      ${unavailable.map((band,index)=>svg`<text class=${`unavailable-band ${this.disabled(band)?'disabled-label':''}`} x="40" y=${18+index*14} role=${this.edit?'button':'img'} tabindex=${this.edit?'0':'-1'} aria-label=${this.edit?'Edit unavailable dynamic time band':'Solar event unavailable'} @click=${()=>{if(this.edit)this.emit('band-edit',band);}} @keydown=${(e:KeyboardEvent)=>{if(this.edit&&e.key==='Enter'){this.emit('band-edit',band);e.preventDefault();}}}>${this.disabled(band)?'Disabled · ':''}Solar event unavailable *</text>`)}
      <g class=${`active-schedule ${this.previewSub?'dimmed':''}`}>
      ${this.sub.bands.map(b=>{const minutes=resolvedBand(b,this.solarMinutes);return minutes?svg`<g class=${this.disabled(b)?'disabled-band':''}><rect class="band-hit" x=${x(minutes[0])+14} y="30" width=${Math.max(0,x(minutes[1])-x(minutes[0])-28)} height="78" fill="transparent" @pointerdown=${(e:PointerEvent)=>{if(this.edit)this.down(e,b);}}/><line x1=${x(minutes[0])} y1="78" x2=${x(minutes[1])} y2="78" stroke="currentColor" stroke-dasharray="6 5" pointer-events="none"/>${this.disabled(b)?svg`<text class="disabled-label" x=${x((minutes[0]+minutes[1])/2)} y=${b.one_off?126:24} text-anchor="middle">Disabled</text>`:nothing}</g>`:nothing;})}
      ${repeat(markers,marker=>marker.key,({key,band:b,endpoint})=>{
          const start = endpoint==='start_minute'; const minutes=resolvedBand(b,this.solarMinutes)!;const minute=minutes[start?0:1],dynamic=start?b.start_dynamic:b.end_dynamic,label=`${time(minute)}${dynamic?' *':''}`;
          const touching=this.sub.bands.some(other=>other.id!==b.id&&resolvedBand(other,this.solarMinutes)?.[start?1:0]===minute);
          const offset=touching?(start?12:-12):0;
          const compact=minutes[1]-minutes[0]<15;
          const top=!start&&compact?66:36;const bottom=!start&&compact?104:88;
          const center=x(minute)+offset;const labelY=(top+bottom)/2;
          return svg`<g data-marker=${key} class="marker ${start?'start':'end'} ${b.one_off?'one-off':''} ${this.disabled(b)?'disabled':''} ${key===this.activeMarker?'selected':''}" role="button" tabindex="0" aria-pressed=${key===this.activeMarker} aria-label=${`${b.one_off?'One-off. ':''}${this.disabled(b)?'Disabled. ':''}${start?'Target start':'Setback stop'} ${time(minute)}${minute===1440?' End of day / midnight':''}. ${this.edit?'Enter edits, Delete removes band, arrows adjust five minutes.':'Select to bring forward. Tab selects overlapping markers.'}`}
            @pointerdown=${(e:PointerEvent)=>this.down(e,b,endpoint)}
            @focus=${()=>{if(this.activeMarker!==key)this.promote(key,true);}}
            @keydown=${(e:KeyboardEvent)=>{if(!this.edit){if(e.key==='Enter'||e.key===' '){this.promote(key);e.preventDefault();}return;}if(e.key==='Enter'){this.emit('band-edit',b);e.preventDefault();}if(e.key==='Delete'){this.emit('band-delete',b);e.preventDefault();}if(['ArrowLeft','ArrowRight'].includes(e.key)){if(!(endpoint==='start_minute'?b.start_dynamic:b.end_dynamic)){b[endpoint]=clampEndpoint(this.sub,b,endpoint,minute+(e.key==='ArrowLeft'?-5:5),this.solarMinutes);if(b.one_off_run)delete b.one_off_run.minutes;this.emit('band-change',{});this.requestUpdate();}e.preventDefault();}}}>
            <rect class="hit-area" x=${center-14} y=${top} width="28" height=${108-top} fill="transparent"/>
            <path d=${`M ${x(minute)} 108 L ${center-9} ${bottom} L ${center-9} ${top} L ${center+9} ${top} L ${center+9} ${bottom} Z`}/>
            <text x=${center} y=${labelY} transform=${`rotate(-90 ${center} ${labelY})`} text-anchor="middle" dominant-baseline="central" style="fill:white;pointer-events:none">${label}</text>
          </g>`;
        })}
      </g>
      ${this.sub.bands.filter(b=>b.one_off).map(b=>{const minutes=resolvedBand(b,this.solarMinutes);return minutes?this.oneOffBadge(x((minutes[0]+minutes[1])/2)):nothing;})}
      ${this.showCurrentTime?svg`<line class="current-line" x1=${x(this.minute)} y1="31" x2=${x(this.minute)} y2="149" stroke="var(--orange,#ff861f)" stroke-width="3.5" pointer-events="none"/>`:nothing}
      ${this.previewSub?svg`<g class="ghost-preview" role="img" aria-label=${`Preview ${this.previewDay} sub-schedule`}>${this.previewSub.bands.map(band=>{const minutes=resolvedBand(band,this.previewSolarMinutes);return minutes?svg`<g class=${`${this.disabled(band,this.previewSub!)?'disabled-preview':''} ${band.one_off?'one-off-preview':''}`}><line class="ghost-connector" x1=${x(minutes[0])} y1="68" x2=${x(minutes[1])} y2="68"/>${band.one_off?this.oneOffBadge(x((minutes[0]+minutes[1])/2)):nothing}${this.disabled(band,this.previewSub!)?svg`<text class="disabled-label" x=${x((minutes[0]+minutes[1])/2)} y=${band.one_off?126:24} text-anchor="middle">Disabled</text>`:nothing}${(['start_minute','end_minute'] as const).map(endpoint=>{const start=endpoint==='start_minute',minute=minutes[start?0:1],center=x(minute),dynamic=start?band.start_dynamic:band.end_dynamic;return svg`<g class="ghost-endpoint"><path class=${`ghost-marker ${start?'start':'end'}`} d=${`M ${center} 108 L ${center-9} 82 L ${center-9} 30 L ${center+9} 30 L ${center+9} 82 Z`}/><text x=${center} y="56" text-anchor="middle" dominant-baseline="central" transform=${`rotate(-90 ${center} 56)`}>${time(minute)}${dynamic?' *':''}</text></g>`;})}</g>`:nothing;})}</g>`:nothing}
      ${this.showCurrentTime?svg`<g class="current-label" role="img" aria-label=${`Current time ${time(this.minute)}`} pointer-events="none">
        <rect x=${x(this.minute)-32} y="1" width="64" height="30" rx="8"/>
        <text x=${x(this.minute)} y="22" text-anchor="middle">${time(this.minute)}</text>
      </g>`:nothing}
    </svg>${this.edit?html`<div class="marker-tools">${selected?html`<button @click=${()=>this.emit('band-edit',selected.band)}>Edit times</button><button @click=${()=>this.emit('band-delete',selected.band)}>Delete band…</button>`:nothing}</div>`:nothing}`;
  }
}
if(!customElements.get('hsm-timeline'))customElements.define('hsm-timeline', SchedulingTimeline);

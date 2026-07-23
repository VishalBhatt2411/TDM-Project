import { LightningElement, api } from "lwc";

export default class TdmKpiTile extends LightningElement {
  @api label;
  @api value;
  @api suffix = "";
  @api accent = "blue"; // blue | green | amber | red

  get tileClass() {
    return `kpi-tile kpi-tile_${this.accent}`;
  }
}

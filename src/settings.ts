"use strict";

import { dataViewObjectsParser } from "../node_modules/powerbi-visuals-utils-dataviewutils/lib";
import { DataPointSettings } from "./dataPointSettings";;
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class VisualSettings extends DataViewObjectsParser {
      public dataPoint: DataPointSettings = new DataPointSettings();
}

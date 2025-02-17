
// powerbi.extensibility.utils.formatting
import {
    valueFormatter as vf,
    textMeasurementService as tms
} from "../node_modules/powerbi-visuals-utils-formattingutils/lib/src";
import { TextProperties } from "../node_modules/powerbi-visuals-utils-formattingutils/lib/src/interfaces";
import { textMeasurementService } from "powerbi-visuals-utils-formattingutils/lib/src";
import { valueFormatter } from "../node_modules/powerbi-visuals-utils-formattingutils/lib/src";

import * as Utils from "./jsUtils";
import * as Calculator from "./calculator";
import { Visual } from './visual';


export class Renderer {
    private visual: Visual;
    private tableDefinition: any; // This variable is set in renderAllContent

    constructor(visual: Visual) {
        this.visual = visual;
    }

    private RenderNoContentText(target: HTMLElement) {
        var t = document.createTextNode("No table definition defined. Edit the table definition by pressing the edit link in the upper right menu.");
        target.appendChild(t);
    }

    private RenderNonNumericColumns(target: HTMLElement) {
        var t = document.createTextNode("Columns other than the first one contains non-numeric fields. This is not allowed.");
        target.appendChild(t);
    }

    private GetValueForColumnRowCalculationByIndex(row: any, colIndex: number, colDef: any, modelRow: any): any {
        var model = this.visual.getModel();

        // Till denna funktion kommer vi en gång per beräknad rad.       
        var fExpression = row.formula;

        for (let m of model) {
            // Gå igenom varje rad i modellen för att hitta referenser
            if (row.formula !== null && m.name !== null) {
                var iPos = row.formula.toLowerCase().indexOf(m.name.toLowerCase());
                if (iPos !== -1) {
                    var modelRawValue = m.values[colIndex].rawValue;
                    fExpression = Utils.replace2(fExpression, m.name, modelRawValue);
                }
            }
        }

        var rawValue = Calculator.EvalFormula(fExpression);
        var format = modelRow.values[colIndex].formatString;

        if (Utils.containsValue(colDef.format)) { // Only use column formatting if it is defined
            format = colDef.format;
        }
        if (Utils.containsValue(row.format)) { // Only use row formatting if it is defined
            format = row.format;
        }
        var formattedValue = this.FormatValue(rawValue, format);

        return { formattedValue, rawValue, modelRawValue, format };
    }

    private FormatValue(rawValue, format) {
        // TODO: improve performance by creating the customFormatter globally.
        // culture: "en-US"
        var customFormatter = null;
        if (Utils.containsValue(this.tableDefinition.culture)) {
            customFormatter = valueFormatter.create({
                cultureSelector: "zh-TW", // this.tableDefinition.culture,
                format
            });
        } else {
            customFormatter = valueFormatter.create({
                cultureSelector: this.visual.host.locale,
                format
            });
        }
        var formattedValue = customFormatter.format(rawValue);
        return formattedValue;
    }

    private GetValueForColumnRowCalculationByName(row: any, colDef: any): any {
        var model = this.visual.getModel();
        var colNameWithBrackets = colDef.refName;
        var rawValue = 0;
        var colIndex = -1;
        var modelRow = model[0];
        for (let m of model) {
            // Gå igenom varje rad i modellen för att hitta referenser
            if (row.formula !== null && m.name !== null) {
                var iPos = row.formula.toLowerCase().indexOf(m.name.toLowerCase());
                if (iPos !== -1) {
                    // Vi har hittat raden
                    modelRow = m;
                    break;
                }
            }
        }

        for (var i = 0; i < modelRow.values.length; i++) {
            if (modelRow.values[i].refName === colNameWithBrackets) {
                colIndex = i;
                break;
            }
        }
        var retValue = null;
        if (colIndex !== -1 && typeof (colIndex) !== "undefined") {
            retValue = this.GetValueForColumnRowCalculationByIndex(row, colIndex, colDef, modelRow);
        } else {
            retValue = {
                formattedValue: "(Unknown column)", rawValue: null
            }
        }
        return retValue;
    }

    private GetValueForColumCalculation(row: any, col): any {
        var calculationFormula = col.calculationFormula;
        var s = calculationFormula;
        var i = 0;
        var result = 0;
        var resultExpression = calculationFormula;
        while (true) {
            s = s.trim();
            if (s.length === 0 || i > 10) {
                break;
            }
            if (s[0] === "[") {
                s = "+" + s;
            }
            var i1 = s.indexOf("[", 0);
            if (i1 === -1) {
                break;
            }
            var i2 = s.indexOf("]", i1);
            var name = s.substring(i1, i2 + 1);
            var calcColDef = col;

            var orgRefName = calcColDef.refName;
            calcColDef.refName = name;
            var columnValue = this.GetValueForColumnRowCalculationByName(row, calcColDef).rawValue;
            resultExpression = resultExpression.replace(name, columnValue);
            s = s.substr(i2 + 1);
            i++;
            calcColDef.refName = orgRefName;
        }
        var format = col.format;
        if (Utils.containsValue(row.format)) {
            format = row.format;
        }
        var evalValue = Calculator.EvalFormula(resultExpression);
        var resultFormatted = this.FormatValue(evalValue, format);
        return { formattedValue: resultFormatted, rawValue: evalValue };
    }

    private getTableTotalWidth(): number {
        var w = 0;
        var additionalWidth = this.tableDefinition.additionalWidth;
        for (let col of this.tableDefinition.columns) {
            w += col.width;
        }
        if (!isNaN(additionalWidth)) {
            w += additionalWidth;
        }
        return w;
    }

    // Hämtar ut en style och applicerar eventuella globla styles (angivna i reusableCSS)
    private getStyle(style: string) {
        if (typeof (style) === "undefined") {
            return "";
        }
        if (typeof (this.tableDefinition.reusableCSS) === "undefined") {
            return style;
        }
        if (this.tableDefinition.reusableCSS.length === 0) {
            return style;
        }
        var style2 = style;
        for (let cssItem of this.tableDefinition.reusableCSS) {
            style2 = Utils.replace2(style2, cssItem.key, cssItem.value);
        }
        return style2;
    }

    private getStringInside(startChar: string, endChar: string, s: string, includeContaining: boolean) {
        var i1 = s.indexOf(startChar, 0);
        var i2 = s.indexOf(endChar, i1);
        if (i1 === -1 || i2 === -1) {
            return null;
        }
        var s2 = s.substring(i1 + startChar.length, i2);
        if (includeContaining) {
            return s.substring(i1, i2 + endChar.length);
        }
        else {
            return s.substring(i1 + startChar.length, i2);
        }
    }

    private getTitle(col: any) {
        var model = this.visual.getModel();

        var i1 = col.title.indexOf("eval(", 0);
        var i2 = col.title.indexOf(")", i1);
        if (i1 === -1 || i2 === -1) {
            return col.title;
        }
        var expressionToEval = col.title.substring(i1 + 5, i2);
        var colNameWithBrackets = this.getStringInside("[", "]", expressionToEval, true);
        if (colNameWithBrackets === null) {
            return col.title;
        }


        var colIndex = null;
        for (var i = 0; i < model[0].values.length; i++) {
            if (model[0].values[i].refName === colNameWithBrackets) {
                colIndex = i;
                break;
            }
        }
        if (colIndex === null) {
            return col.title;
        }
        var title = col.title;
        title = Utils.replace2(title, colNameWithBrackets, model[0].values[colIndex].rawValue);
        i1 = title.indexOf("eval(", 0);
        i2 = title.lastIndexOf(")");
        var v = title.substring(i1 + 5, i2);
        // var vEvaluated = title.substring(0, i1) + eval(v) + title.substring(i2+1);
        var vEvaluated = title.substring(0, i1) + Calculator.EvalFormula(v) + title.substring(i2 + 1);
        return vEvaluated.trim();
    }

    private appendTextToNode(targetNode: HTMLElement, text: string) {
        var a = text.split("<br>");
        if (a.length === 0) {
            targetNode.appendChild(document.createTextNode(text));
        } else {
            for (var i = 0; i < a.length; i++) {
                targetNode.appendChild(document.createTextNode(a[i]));
                if (i !== a.length - 1) {
                    // Do not add a br to the last one.
                    targetNode.appendChild(document.createElement("br"));
                }
            }
        }
    }

    private htmlGetMasterHeader(): HTMLDivElement {
        // tableHtml += "<div class='div-table-row-masterheader'  style='"+tableDefinition.masterHeader.headerStyle+"'><div>"+tableDefinition.masterHeader.title+"</div></div>";
        var dTableMasterHeader = document.createElement("div");
        dTableMasterHeader.className = "div-table-row-masterheader";
        dTableMasterHeader.setAttribute("style", this.tableDefinition.masterHeader.headerStyle);
        var dTableMasterHeaderContents = document.createElement("div");
        dTableMasterHeader.appendChild(dTableMasterHeaderContents);
        this.appendTextToNode(dTableMasterHeaderContents, this.tableDefinition.masterHeader.title);
        return dTableMasterHeader;
    }

    private htmlGetColumnHeader(column: any): HTMLDivElement {
        var headerStyle = this.getStyle(column.headerStyle);
        var headerTitle = this.getTitle(column);
        var dDiv1 = document.createElement("div");
        dDiv1.className = "div-table-col-number table-cell-content";
        dDiv1.setAttribute("style", "max-width:" + column.width + "px;width:" + column.width + "px;min-width:" + column.width + "px;" + headerStyle);
        var dDiv2 = document.createElement("div");
        dDiv1.appendChild(dDiv2);
        dDiv2.className = "table-cell-content-inner";
        this.appendTextToNode(dDiv2, headerTitle);
        return dDiv1;
    }

    private htmlGetColumnContent(rowStyle: string, cellRowDataStyle: string, renderValue: string): HTMLDivElement {
        // var colHtml = "<div class='div-table-col-number table-cell-content' style='" + rowStyle + ";"+cellRowDataStyle+"'><div class=' table-cell-content-inner'>"+renderValue+"</div></div>";
        var dDiv1 = document.createElement("div");
        dDiv1.className = "div-table-col-number table-cell-content";
        dDiv1.setAttribute("style", rowStyle + ";" + cellRowDataStyle);
        var dDiv2 = document.createElement("div");
        dDiv1.appendChild(dDiv2);
        dDiv2.className = "table-cell-content-inner";
        dDiv2.appendChild(document.createTextNode(renderValue));
        return dDiv1;
    }

    private clearHtmlElement(element: HTMLElement) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    private getCellContents(col: any, row: any, allColumnsAreBlank: boolean, cellRowDataStyle: any): any {
        var renderValue = "";
        var cellContents = null;
        if (col.type === "Data") {
            // Datakolumners innehåll hämtar vi från modellen direkt.
            var v = this.GetValueForColumnRowCalculationByName(row, col);
            allColumnsAreBlank = v.rawValue !== null ? false : allColumnsAreBlank;
            if (isNaN(Number(v.rawValue)) || v.rawValue === null) {
                renderValue = "\u00A0";
            } else {
                renderValue = v.formattedValue;
            }
            v.formatString = col.format;
            cellContents = v;
            // rowCols.push( v );
        }
        else if (col.type === "RowHeader") {
            renderValue = row.title;
            var cellRowHeaderStyle = this.getStyle(row.cellRowHeaderStyle);
            cellRowDataStyle = cellRowHeaderStyle;
            // rowCols.push( { rawValue: null, formatString: null } );
            cellContents = { rawValue: null, formatString: null };
        }
        else if (col.type === "Calculation") {
            // Kolumner som baseras på en formeln räknas ut
            var calcValue = this.GetValueForColumCalculation(row, col);
            renderValue = calcValue.formattedValue;
            if (renderValue.toLowerCase() !== "(blank)" && renderValue.toLowerCase() !== "nan") {
                allColumnsAreBlank = false;
            } else {
                renderValue = "\u00A0";
            }
            calcValue.formatString = col.format;
            // rowCols.push( calcValue );
            cellContents = calcValue;
        }
        else {
            renderValue = "";
            // rowCols.push( { rawValue: null, formatString: null } );
            cellContents = { rawValue: null, formatString: null };
        }
        cellContents.renderValue = renderValue;
        cellContents.cellRowDataStyle = cellRowDataStyle;
        cellContents.styleByMeasure = null;
        if (typeof col.styleByMeasure !== 'undefined' && col.styleByMeasure.length > 0) {
            cellContents.styleByMeasure = col.styleByMeasure
        }
        return cellContents;
    }

    public RenderAllContent(targetElement: HTMLElement, tableDefinitionFromCaller: any) {
        this.tableDefinition = tableDefinitionFromCaller;

        this.clearHtmlElement(targetElement);

        var model = this.visual.getModel();

        if (this.tableDefinition === null) {
            this.RenderNoContentText(targetElement);
            return;
        }

        // Check that all columns except the first one is numeric
        if (model.length > 0 && model[0].values.length > 1) {
            var hasNonNumeric = false;
            for (var i = 1; i < model[0].values.length; i++) {
                if (!model[0].values[i].isNumeric) {
                    hasNonNumeric = true;
                }
            }
        }

        // Denna är kommenterad så att vi kan tillåta mätvärden som är strängar.
        // if ( hasNonNumeric ) {
        //    this.RenderNonNumericColumns(targetElement);
        //    return;
        // }

        // Table border
        var customTableStyle = "";
        if (typeof this.tableDefinition.masterHeader !== 'undefined') {
            customTableStyle = ";" + this.tableDefinition.masterHeader.borderStyle + ";";
        }
        var w = this.getTableTotalWidth();
        var dTableWrapper = document.createElement("div");
        dTableWrapper.className = "tablewrapper";
        var dTable = document.createElement("div");
        dTable.className = "div-table";
        dTable.setAttribute("style", customTableStyle);
        dTableWrapper.appendChild(dTable);

        // Table header row
        var rowStyle = this.getStyle(this.tableDefinition.headerRow.rowStyle);

        // Table header
        if (typeof this.tableDefinition.masterHeader !== 'undefined') {
            dTable.appendChild(this.htmlGetMasterHeader());
        }

        var dTableRowHeader = document.createElement("div");
        dTableRowHeader.className = "div-table-row-header";
        dTableRowHeader.setAttribute("style", rowStyle);
        dTable.appendChild(dTableRowHeader);

        // Column headers
        for (var c = 0; c < this.tableDefinition.columns.length; c++) {
            if (!this.tableDefinition.columns[c].hidden) {
                dTable.appendChild(this.htmlGetColumnHeader(this.tableDefinition.columns[c]));
            }
        }

        var DisplayAllRows = false; // Default value = display all rows
        if (typeof (this.tableDefinition.displayAllRows) !== "undefined") {
            DisplayAllRows = this.tableDefinition.displayAllRows;
        }

        // Fix ranges (replace : with multiple +)
        for (var r = 0; r < this.tableDefinition.rows.length; r++) {
            var row = this.tableDefinition.rows[r];
            var newFormula = "";
            if (row.formula.indexOf("::") > -1) { // indexOf instead of includes to support older browsers
                var p = row.formula.indexOf("::");
                var startRange = row.formula.substring(0, p).trim();
                var endRange = row.formula.substring(p + 2).trim();
                for (var i = 0; i < model.length; i++) {
                    if (model[i].name >= startRange && model[i].name <= endRange) {
                        newFormula += "+" + model[i].name;
                    }
                }
                row.formula = newFormula;
            }
        }

        var rowWithContentsCounter = 0;
        // Table rows
        for (var r = 0; r < this.tableDefinition.rows.length; r++) {
            var row = this.tableDefinition.rows[r];
            var rowHtml = "";
            var rowStyle = this.getStyle(row.rowStyle);
            var dRow = document.createElement("div");
            dRow.className = "div-table-row";
            dRow.setAttribute("style", rowStyle);
            var allColumnsAreBlank: boolean = true;
            var rowCols = [];
            for (var c = 0; c < this.tableDefinition.columns.length; c++) {
                var col = this.tableDefinition.columns[c];
                var colRowStyle = this.getStyle(col.rowStyle);
                var rowStyle = "max-width:" + col.width + "px;" + "min-width:" + col.width + "px;" + "width:" + col.width + "px;" + colRowStyle;
                var cellRowDataStyle = this.getStyle(row.cellRowDataStyle);
                var cellContents = this.getCellContents(col, row, allColumnsAreBlank, cellRowDataStyle);
                cellRowDataStyle = cellContents.cellRowDataStyle;
                allColumnsAreBlank = cellContents.allColumnsAreBlank;

                // Check if we have a direct column reference (replace with another column)
                if (typeof row.directColumnRef !== 'undefined') {
                    for (var i = 0; i < row.directColumnRef.length; i++) {
                        if (row.directColumnRef[i].columnRefName === col.refName) {
                            var replaceWithColumn = row.directColumnRef[i].columnReplaceRefName;
                            var replaceCol = this.tableDefinition.columns.filter(a => a.refName === replaceWithColumn)[0];
                            if (typeof replaceCol !== 'undefined') {
                                cellContents = this.getCellContents(replaceCol, row, allColumnsAreBlank, cellRowDataStyle);
                                break;
                            }
                        }
                    }
                }

                // Dynamic style handling (styeByMeasure)
                if (cellContents.styleByMeasure !== null) {
                    var colStyle = this.tableDefinition.columns.filter(a => a.refName === cellContents.styleByMeasure)[0];
                    var colStyleContents = this.getCellContents(colStyle, row, allColumnsAreBlank, cellRowDataStyle);
                    rowStyle = rowStyle + ";" + colStyleContents.modelRawValue + ";";
                }

                rowCols.push(cellContents);
                var renderValue = cellContents.renderValue;

                // Check if we should ignore presentation of this field for this column.
                var shouldHideValue = false;
                if (typeof row.hideForColumns !== 'undefined') {
                    for (var i = 0; i < row.hideForColumns.length; i++) {
                        if (row.hideForColumns[i] === col.refName) {
                            shouldHideValue = true;
                            break;
                        }
                    }
                }
                if (shouldHideValue) {
                    renderValue = "\u00A0";
                }

                if (row.formula.length === 0) {
                    renderValue = "";
                }
                if (!col.hidden) {
                    dRow.appendChild(this.htmlGetColumnContent(rowStyle, cellRowDataStyle, renderValue));
                }
            }
            // if ( !allColumnsAreBlank || row.formula.length === 0 || DisplayAllRows ) {
            //    // Do nothing
            // } else {
            // }
            // Add calculated row to model (to be able to reuse it in later calculations)
            var isCalculatedRow = true;
            for (var i = 0; i < model.length; i++) {
                if (model[i].title === row.title) {
                    isCalculatedRow = false;
                }
            }
            if (isCalculatedRow && row.title.length > 0) {
                // Add new row - it does not exist already
                var newTitle = row.title;
                var newName = "[" + newTitle + "]";
                for (var c = 0; c < rowCols.length; c++) {
                    rowCols[c].displayName = newTitle;
                    rowCols[c].refName = this.tableDefinition.columns[c].refName;
                    rowCols[c].formatString = rowCols[c].format;
                }
                var newModelRow = {
                    name: newName,
                    title: newTitle,
                    values: rowCols
                };
                model.push(newModelRow);
            }
            if (row.visible) {
                if (!allColumnsAreBlank || row.formula.length === 0 || DisplayAllRows) {
                    dTable.appendChild(dRow);
                } else {
                    // Do nothing
                }
            }

            // Alternating rows.
            if (row.visible && !allColumnsAreBlank && row.formula !== "") {
                if (rowWithContentsCounter % 2 === 1) {
                    if (typeof (this.tableDefinition.alternatingRowStyle) !== 'undefined') {
                        let currStyle = dRow.getAttribute("style");
                        dRow.setAttribute("style", currStyle + ";" + this.tableDefinition.alternatingRowStyle + ";");
                    }
                }

                rowWithContentsCounter++;
            }
        }
        // tableHtml += "</div></div>";
        targetElement.appendChild(dTableWrapper);
    }
}

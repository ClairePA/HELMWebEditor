﻿/*******************************************************************************
* Copyright (C) 2018, The Pistoia Alliance
* Created by Scilligence, built on JSDraw.Lite
* 
* Permission is hereby granted, free of charge, to any person obtaining
* a copy of this software and associated documentation files (the
* "Software"), to deal in the Software without restriction, including
* without limitation the rights to use, copy, modify, merge, publish,
* distribute, sublicense, and/or sell copies of the Software, and to
* permit persons to whom the Software is furnished to do so, subject to the 
* following conditions:
* 
* The above copyright notice and this permission notice shall be
* included in all copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
* IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
* CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
* TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
* SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*******************************************************************************/

/**
* HELM Editor Plugin class
* @class org.helm.webeditor.Plugin
*/
org.helm.webeditor.Plugin = scil.extend(scil._base, {
    /**
    @property {MonomerExplorer} monomerexplorer - Monomer Explorer
    **/
    /**
    @property {JSDraw2.Editor} jsd - Drawing Canvas
    **/

    /**
    * @constructor Plugin
    * @param {JSDraw2.Editor} jsd - The JSDraw canvas
    **/
    constructor: function (jsd) {
        this.jsd = jsd;
        this.monomerexplorer = null;
    },

    /**
    * Get the molecule formula
    * @function getMF
    * @param {bool} html - indicate if html format is needed
    * @returns the molecular formula as a string
    */
    getMF: function (html) {
        return org.helm.webeditor.Formula.getMF(this.jsd.m, html);
    },

    /**
    * Get the molecule weight
    * @function getMW
    * @returns the molecular weight as a number
    */
    getMW: function () {
        return org.helm.webeditor.Formula.getMW(this.jsd.m);
    },

    /**
    * Get the Extinction Coefficient
    * @function getExtinctionCoefficient
    * @returns the Extinction Coefficient as a number
    */
    getExtinctionCoefficient: function () {
        return org.helm.webeditor.ExtinctionCoefficient.calculate(this.jsd.m);
    },

    getSpareRs: function (a, rs) {
        if (a.bio == null) // not bio
            return [];

        var m = org.helm.webeditor.Monomers.getMonomer(a);
        if (m == null)
            return null;

        if (rs == null)
            rs = [];
        else
            rs.splice(0, rs.length);

        for (var r in m.at) {
            var i = parseInt(r.substr(1));
            rs[i] = true;
        }

        var used = [];
        var bonds = this.jsd.m.getNeighborBonds(a);
        for (var i = 0; i < bonds.length; ++i) {
            var b = bonds[i];
            if (b.a1 == a) {
                used[b.r1] = true;
                if (rs[b.r1] != null)
                    rs[b.r1] = false;
            }
            else if (b.a2 == a) {
                used[b.r2] = true;
                if (rs[b.r2] != null)
                    rs[b.r2] = false;
            }
        }

        var ret = [];
        for (var i = 1; i <= rs.length; ++i) {
            if (rs[i])
                ret.push(i);
        }

        if (ret.length == 0 && a.biotype() == org.helm.webeditor.HELM.BLOB)
            return "?";

        return ret.length == 0 ? null : ret;
    },

    setAtomProp: function (obj) {
        var a = JSDraw2.Atom.cast(obj);
        if (a == null)
            return;

        if (this.atomPropDlg == null) {
            var me = this;
            var fields = {
                elem: { label: "Monomer Symbol" },
                tag: { label: "Annotation" }
            };
            this.atomPropDlg = scil.Form.createDlgForm("Monomer Attributes", fields, { label: "Save", onclick: function () { me.setAtomProp2(); } });
        }
        else {
            this.atomPropDlg.show();
        }

        var elem = a.elem;
        if (elem == "?" && !scil.Utils.isNullOrEmpty(a.bio.ambiguity))
            elem = a.bio.ambiguity;

        if (elem == "Blob" || elem == "Group")
            this.atomPropDlg.form.fields.elem.setAttribute("readonly", "readonly");
        else
            this.atomPropDlg.form.fields.elem.removeAttribute("readonly");

        var data = { elem: elem, tag: a.tag };
        this.atomPropDlg.form.setData(data);
        this.atomPropDlg.atom = a;
    },

    setAtomProp2: function () {
        var data = this.atomPropDlg.form.getData();
        data.elem = scil.Utils.trim(data.elem);
        data.tag = scil.Utils.trim(data.tag);

        if (scil.Utils.isNullOrEmpty(data.elem)) {
            scil.Utils.alert("Monomer Type cannot be blank");
            return;
        }

        var f = false;
        var clone = this.jsd.clone();
        var a = this.atomPropDlg.atom;
        if (a.elem != data.elem || (a.tag == null ? "" : a.tag) != data.tag) {
            var set = org.helm.webeditor.Monomers.getMonomerSet(a.biotype());
            var m = set[scil.helm.symbolCase(data.elem)];
            if (m == null) {
                if (!org.helm.webeditor.isAmbiguous(data.elem, a.biotype())) {
                    data.elem = "(" + data.elem + ")";
                    if (!org.helm.webeditor.isAmbiguous(data.elem, a.biotype())) {
                        scil.Utils.alert("Invalid Monomer Type");
                        return;
                    }
                }

                a.elem = "?";
                a.bio.ambiguity = data.elem;
            }
            else {
                a.elem = data.elem;
                a.bio.ambiguity = null;
            }

            f = true;
            a.tag = data.tag == "" ? null : data.tag;
        }

        this.atomPropDlg.hide();

        if (f) {
            this.jsd.pushundo(clone);
            this.jsd.refresh(true);
        }
    },

    setBondProp: function (obj) {
        var b = JSDraw2.Bond.cast(obj);
        if (b == null)
            return;

        var data = {};
        var blob1 = this._getDisplayName(b, data, 1);
        var blob2 = this._getDisplayName(b, data, 2);
        if (!blob1 && !blob2)
            return;

        data.a1ratio = b.ratio1;
        data.a2ratio = b.ratio2;

        if (this.bondPropDlg == null) {
            var me = this;
            var fields = {
                a1: { label: "Monomer #1", viewonly: true },
                a1pos: { label: "Position" },
                a1r: { label: "R#" },
                a1ratio: { label: "Ratio", type: "number", accepts: "^[?]$" },
                a2: { label: "Monomer #2", viewonly: true },
                a2pos: { label: "Position" },
                a2r: { label: "R#" },
                a2ratio: { label: "Ratio", type: "number", accepts: "^[?]$" }
            };
            this.bondPropDlg = scil.Form.createDlgForm("Bond Attributes", fields, { label: "Save", onclick: function () { me.setBondProp2(); } });
        }
        else {
            this.bondPropDlg.show();
        }

        this.bondPropDlg.form.fields.a1pos.disabled = !blob1;
        this.bondPropDlg.form.fields.a1r.disabled = !blob1;
        this.bondPropDlg.form.fields.a2pos.disabled = !blob2;
        this.bondPropDlg.form.fields.a2r.disabled = !blob2;

        if (scil.Utils.isNullOrEmpty(data.a1ratio))
            data.a1ratio = org.helm.webeditor.defaultbondratio;
        if (scil.Utils.isNullOrEmpty(data.a2ratio))
            data.a2ratio = org.helm.webeditor.defaultbondratio;

        this.bondPropDlg.form.setData(data);
        this.bondPropDlg.bond = b;
    },

    _getDisplayName: function (b, data, i) {
        var ai = "a" + i;
        var ri = "r" + i;
        var air = "a" + i + "r";
        var aipos = "a" + i + "pos";

        var ret = false;
        if (b[ai].biotype() == org.helm.webeditor.HELM.BLOB) {
            ret = true;
            data[ai] = b[ai].elem;
            var p = typeof (b[ri]) == "string" ? b[ri].indexOf(':') : -1;
            if (p > 0) {
                data[aipos] = b[ri].substr(0, p);
                data[air] = b[ri].substr(p + 1);
            }
            else {
                data[air] = b[ri];
            }
        }
        else {
            data[ai] = b[ai].elem;
            data.a1r = b[ri];
        }

        return ret;
    },

    setBondProp2: function () {
        var data = this.bondPropDlg.form.getData();
        this.bondPropDlg.hide();

        if (data.a1ratio == "?" || data.a2ratio == "?") {
            data.a1ratio = data.a2ratio = "?";
        }
        else {
            if (data.a1ratio == "")
                data.a1ratio = org.helm.webeditor.defaultbondratio;
            if (data.a2ratio == "")
                data.a2ratio = org.helm.webeditor.defaultbondratio;
        }

        var f = false;
        var clone = this.jsd.clone();
        var b = this.bondPropDlg.bond;
        if (b.a1.biotype() == org.helm.webeditor.HELM.BLOB) {
            if (this._makeBondR(data.a1pos, data.a1r, b, "r1"))
                f = true;
        }
        if (!this._isRatioEq(b.ratio1, data.a1ratio)) {
            b.ratio1 = data.a1ratio > 0 || data.a1ratio == "?" ? data.a1ratio : null;
            f = true;
        }

        if (b.a2.biotype() == org.helm.webeditor.HELM.BLOB) {
            if (this._makeBondR(data.a2pos, data.a2r, b, "r2"))
                f = true;
        }
        if (!this._isRatioEq(b.ratio2, data.a2ratio)) {
            b.ratio2 = data.a2ratio > 0 || data.a2ratio == "?" ? data.a2ratio : null;
            f = true;
        }

        if (f) {
            this.jsd.pushundo(clone);
            this.jsd.refresh(true);
        }
    },

    _isRatioEq: function (r1, r2) {
        if (!(r1 > 0 || r1 == "?") || r1 == "")
            r1 = null;
        if (!(r2 > 0 || r2 == "?") || r2 == "")
            r2 = null;

        return r1 == r2;
    },

    _makeBondR: function (pos, r, b, key) {
        if (pos != null)
            pos = pos.trim();
        if (scil.Utils.isNullOrEmpty(pos))
            pos = "?";

        if (r != null)
            r = r.trim();
        if (scil.Utils.isNullOrEmpty(r))
            r = "?";

        var s = pos + ":" + (!isNaN(r) && r > 0 ? "R" + r : r);
        if (b[key] == s)
            return false;

        b[key] = s;
        return true;
    },

    expandSuperAtom: function (obj) {
        var a = JSDraw2.Atom.cast(obj);
        if (a == null || a.bio == null || !org.helm.webeditor.isHelmNode(a))
            return false;

        this.jsd.pushundo();
        if (this.groupExpand(a))
            this.jsd.refresh(true);
        return true;
    },

    hasSpareR: function (a, r) {
        if (a == null)
            return false;
        if (a.bio == null)
            return true;

        if (typeof (r) == "string" && scil.Utils.startswith(r, "R"))
            r = parseInt(r.substr(1));

        if (a.biotype() == org.helm.webeditor.HELM.BLOB)
            return true;

        var rs = this.getSpareRs(a);
        if (rs == null || rs.indexOf(r) < 0) {
            //scil.Utils.alert("The monomer, " + a.elem + ", does define R" + r);
            return false;
        }

        var bonds = this.jsd.m.getNeighborBonds(a);
        for (var i = 0; i < bonds.length; ++i) {
            var b = bonds[i];
            if (b.a1 == a && b.r1 == r)
                return false;
            else if (b.a2 == a && b.r2 == r)
                return false;
        }

        return true;
    },

    getDefaultNodeType: function (a, c) {
        var s = null;
        if (this.monomerexplorer != null)
            s = this.monomerexplorer.selected[a];
        if (!scil.Utils.isNullOrEmpty(s))
            return s;

        var set = org.helm.webeditor.Monomers.getMonomerSet(a);
        var m = set == null || this.jsd._keypresschar == null ? null : set[this.jsd._keypresschar];
        if (m != null)
            return m.id;

        if (c != null)
            return c;

        return org.helm.webeditor.Monomers.getDefaultMonomer(a);
    },

    setNodeType: function (a, biotype, elem) {
        var mon = org.helm.webeditor.Monomers.getMonomer(biotype, elem);
        if (mon != null) {
            var id = a.bio == null ? null : a.bio.id;
            a.bio = { type: biotype, id: id };
            a.elem = mon.id;
            return true;
        }

        var f = org.helm.webeditor.isAmbiguous(elem, biotype);
        if (!f) {
            elem = "(" + elem + ")";
            f = org.helm.webeditor.isAmbiguous(elem, biotype);
        }

        if (f) {
            a.elem = "?";
            a.bio = { type: biotype, id: id, ambiguity: elem };
            return true;
        }

        return false;
    },

    setNodeTypeFromGui: function (a, s) {
        var m = scil.helm.Monomers.getMonomer(a, s);
        if (m != null) {
            a.elem = s;
            return true;
        }

        var f = org.helm.webeditor.isAmbiguous(s, a.biotype());
        if (!f) {
            s = "(" + s + ")";
            f = org.helm.webeditor.isAmbiguous(s, a.biotype());
        }

        if (f) {
            a.elem = "?";
            a.bio.ambiguity = s;
            return true;
        }

        scil.Utils.alert("Unknown monomer type: " + s);
        return false;
    },

    cancelDnD: function () {
        if (this.monomerexplorer != null)
            this.monomerexplorer.dnd.cancel();
    },

    /**
    * Replace monomers
    * @function replaceMonomer
    * @param {enum} monomertype - org.helm.webeditor.HELM.BASE/SUGAR/LINKER/AA/CHEM
    * @param {string} find - the monomer name to be found
    * @param {string} replacedwith - the monomer name to be replaced with
    * @param {bool} selectedonly - indicate if seaching the selected part only
    * @returns the count replaced
    */
    replaceMonomer: function (monomertype, find, replacedwith, selectedonly) {
        var n = 0;
        var atoms = this.jsd.m.atoms;
        for (var i = 0; i < atoms.length; ++i) {
            var a = atoms[i];
            if ((selectedonly && a.selected || !selectedonly) &&
                find == a.elem &&
                (monomertype == "" || monomertype == a.biotype())) {
                if (this.setNodeType(a, a.biotype(), replacedwith))
                    ++n;
            }
        }
        return n;
    },

    makeComplementaryStrand: function (a) {
        var chain = org.helm.webeditor.Chain.getChain(this.jsd.m, a);
        if (chain == null)
            return null;

        return chain.makeComplementaryStrand(this.jsd.m, this.jsd.bondlength);
    },

    setHelmBlobType: function (a, type) {
        if (a.biotype() == org.helm.webeditor.HELM.BLOB && a.bio.blobtype != type) {
            this.jsd.pushundo();
            a.bio.blobtype = type;
            this.jsd.refresh(true);
        }
    },

    createGroup: function (a, collapse, resetid) {
        var list = [];
        var graphics = this.jsd.m.graphics;
        for (var i = 0; i < graphics.length; ++i) {
            if (JSDraw2.Group.cast(graphics[i]) != null && graphics[i].selected)
                list.push(graphics[i]);
        }

        if (list.length > 1)
            return this.createGroup2(list, collapse);

        list = [];
        var atoms = this.jsd.m.atoms;
        for (var i = 0; i < atoms.length; ++i) {
            if (atoms[i].selected)
                list.push(atoms[i]);
        }

        if (list.length == 0)
            return false;

        var chain = null;
        var chains = org.helm.webeditor.Chain.getChains(this.jsd.m);
        if (chains.length > 0) {
            var a0 = list[0];
            for (var i = 0; i < chains.length; ++i) {
                if (scil.Utils.indexOf(chains[i].atoms, a0) >= 0) {
                    chain = chains[i];
                    break;
                }
            }
        }

        if (chain == null)
            return false;

        for (var i = 0; i < list.length; ++i) {
            if (scil.Utils.indexOf(chain.atoms, list[i]) < 0 && scil.Utils.indexOf(chain.bases, list[i]) < 0) {
                scil.Utils.alert("All monomer should be in one chain");
                return false;
            }
        }

        var openbonds = [];
        for (var i = 0; i < chain.bonds.length; ++i) {
            var b = chain.bonds[i];
            var i1 = scil.Utils.indexOf(list, b.a1);
            var i2 = scil.Utils.indexOf(list, b.a2);
            if (i1 < 0 && i2 >= 0 || i1 >= 0 && i2 < 0)
                openbonds.push({ bond: b, ai: i1 >= 0 ? 1 : 2 });
        }

        var g = this.createGroup2(list, collapse);
        if (g != null && openbonds.length > 0) {
            var sa = this.collapseGroup(g);
            org.helm.webeditor.Layout.resetIDs(sa.superatom, true);
            this.groupExpand(sa);

            for (var i = 0; i < openbonds.length; ++i) {
                var b = openbonds[i];
                if (b.ai == 1) {
                    var a1 = b.bond.a1;
                    b.bond.a1 = sa;
                    b.bond.r1 = a1._aaid + ":R" + b.bond.r1;
                }
                else {
                    var a2 = b.bond.a2;
                    b.bond.a2 = sa;
                    b.bond.r2 = a2._aaid + ":R" + b.bond.r2;
                }
            }
        }

        if (g != null && resetid)
            org.helm.webeditor.Layout.resetIDs(this.jsd.m);
        return g != null;
    },

    createGroup2: function (list, collapse) {
        var g = new JSDraw2.Group("", "helmgroup");
        g.gap = 10;
        this.jsd.m.addGraphics(g);

        for (var i = 0; i < list.length; ++i)
            list[i].group = g;

        //this.jsd.refresh(true);
        if (collapse)
            this.collapseGroup(g);
        return g;
    },

    collapseGroup: function (g, clean) {
        if (JSDraw2.Group.cast(g) == null)
            return null;

        this.jsd.m.clearFlag();
        var ret = this._collapseGroup(g);
        if (ret != null && clean)
            this.clean();

        return ret;
    },

    _collapseGroup: function (g) {
        var sa = g.a != null ? g.a : org.helm.webeditor.Interface.createAtom(this.jsd.m, new JSDraw2.Point());
        //sa.tag = "Group";
        var mol = new JSDraw2.Mol();
        sa.superatom = mol;
        sa.hidden = null;
        sa.group = g.group;
        sa.ratio = g.ratio;
        sa.tag = g.tag;
        this.setNodeType(sa, org.helm.webeditor.HELM.BLOB, "group");

        var graphics = scil.clone(this.jsd.m.graphics);
        for (var i = 0; i < graphics.length; ++i) {
            var g2 = graphics[i];
            if (g2.group == g)
                this._collapseGroup(g2);
        }

        var atoms = this.jsd.m.atoms;
        for (var i = atoms.length - 1; i >= 0; --i) {
            var a = atoms[i];
            if (a.group == g) {
                mol.atoms.push(a);
                a.f = true;
                a.selected = false;
                atoms.splice(i, 1);
            }
        }

        var apo = 0;
        var connections = [];
        var bonds = this.jsd.m.bonds;
        for (var i = bonds.length - 1; i >= 0; --i) {
            var b = bonds[i];
            if (b.a1.f != b.a2.f) {
                ++apo;
                connections.push(b);
                if (b.a1.f) {
                    b.a1.attachpoints.push(apo);
                    b.a1 = sa;
                    b.apo1 = apo;
                }
                else {
                    b.a2.attachpoints.push(apo);
                    b.a2 = sa;
                    b.apo2 = apo;
                }
            }
            else if (b.a1.f && b.a2.f) {
                mol.bonds.push(b);
                bonds.splice(i, 1);
            }
        }

        var r = org.helm.webeditor.Layout.getRect(mol.atoms);
        sa.p = r.center();

        this.jsd.m.delGraphics(g);
        //this.clean();

        //this.jsd.refresh(true);
        return sa;
    },

    groupExpand: function (a) {
        if (a == null || a.superatom == null)
            return false;

        var m = a.superatom;
        var bonds = this.jsd.m.getAllBonds(a);
        for (var i = 0; i < bonds.length; ++i) {
            var b = bonds[i];
            if (b.a1 == a) {
                var oa = this.findAtomByAP(m, b.apo1);
                if (oa != null) {
                    b.a1 = oa;
                    scil.Utils.delFromArray(oa.attachpoints, b.apo1);
                    b.apo1 = null;
                }
            }
            else {
                var oa = this.findAtomByAP(m, b.apo2);
                if (oa != null) {
                    b.a2 = oa;
                    scil.Utils.delFromArray(oa.attachpoints, b.apo2);
                    b.apo2 = null;
                }
            }
        }

        var c = m.rect().center();
        m.offset(a.p.x - c.x, a.p.y - c.y);

        this.jsd.m.mergeMol(m);

        var g = new JSDraw2.Group("", "helmgroup");
        g.gap = 10;
        this.jsd.m.addGraphics(g);
        for (var i = 0; i < m.atoms.length; ++i)
            m.atoms[i].group = g;

        g.a = a;
        g.group = a.group;
        g.ratio = a.ratio;
        g.tag = a.tag;
        a.superatom = null;
        a.hidden = true;
        //this.jsd.m.delAtom(a);
        //this.clean();

        //this.jsd.refresh(true);
        return true;
    },

    findAtomByAP: function (m, apo) {
        for (var i = 0; i < m.atoms.length; ++i) {
            var a = m.atoms[i];
            if (scil.Utils.indexOf(a.attachpoints, apo) >= 0)
                return a;
        }
        return null;
    },

    /**
    * Apply a rule
    * @function applyRule
    * @param {function} rulefun - a rule function to be called: function(plugin) {}
    */
    applyRule: function (rulefun) {
        org.helm.webeditor.RuleSet.applyRule(this, rulefun);
    },

    applyRules: function (funs) {
        org.helm.webeditor.RuleSet.applyRules(this, funs);
    },

    addNode: function (p, biotype, elem) {
        elem = org.helm.webeditor.IO.trimBracket(elem);

        var m = org.helm.webeditor.Monomers.getMonomer(biotype, elem);
        if (m == null)
            m = org.helm.webeditor.Monomers.addSmilesMonomer(biotype, elem);

        var ambiguity = null;
        if (m == null && org.helm.webeditor.isAmbiguous(elem, biotype)) {
            m = org.helm.webeditor.Monomers.getMonomer(biotype, "?");
            ambiguity = elem;
        }

        if (m == null) {
            scil.Utils.alert("Unknown " + biotype + " monomer name: " + elem);
            return null;
        }

        var a = org.helm.webeditor.Interface.createAtom(this.jsd.m, p);
        this.setNodeType(a, biotype, m.id == null ? elem : m.id);
        a.bio.ambiguity = ambiguity;
        return a;
    },

    addBond: function (a1, a2, r1, r2) {
        if (a1 == null || a2 == null || a1 == a2 || r1 != "?" && !this.hasSpareR(a1, r1) || r2 != "?" && !this.hasSpareR(a2, r2))
            return null;
        //if (a1.biotype() == org.helm.webeditor.HELM.SUGAR && a2.biotype() == org.helm.webeditor.HELM.SUGAR || a1.biotype() == org.helm.webeditor.HELM.AA && a2.biotype() == org.helm.webeditor.HELM.AA) {
        //    if ((r1 == 1 || r1 == 2) && r1 == r2)
        //        return null;
        //}
        var b = org.helm.webeditor.Interface.createBond(this.jsd.m, a1, a2);
        b.r1 = r1;
        b.r2 = r2;
        return b;
    },

    addHydrogenBond: function (a1, a2) {
        if (a1 == null || a2 == null || a1 == a2)
            return null;
        var b = org.helm.webeditor.Interface.createBond(this.jsd.m, a1, a2);
        b.type = JSDraw2.BONDTYPES.UNKNOWN;
        return b;
    },

    connnectGroup: function (p1, object) {
        var object1 = this.jsd.toggle(p1);
        var object2 = object;
        var t1 = JSDraw2.Atom.cast(object1);
        var t2 = JSDraw2.Atom.cast(object2);

        var showmsg = false;
        if (t1 == null) {
            var g1 = JSDraw2.Group.cast(object1);
            if (g1 != null && !scil.Utils.isNullOrEmpty(g1.ratio)) {
                showmsg = true;
                g1.ratio = null;
            }
            t1 = this.collapseGroup(g1);
            this.groupExpand(t1);
        }

        if (t2 == null) {
            var g2 = JSDraw2.Group.cast(object2);
            if (g2 != null && !scil.Utils.isNullOrEmpty(g2.ratio)) {
                showmsg = true;
                g2.ratio = null;
            }
            t2 = this.collapseGroup(g2);
            this.groupExpand(t2);
        }

        if (showmsg)
            scil.Utils.alert("Ratios on groups are removed");

        if (t1 != null && t2 != null) {
            this.connectFragment(t1, t2);
            this.jsd.moveCenter();
            return true;
        }

        return false;
    },

    connectFragment: function (a1, a2, extendchain) {
        var b = this.jsd.m.findBond(a1, a2);
        if (b != null)
            return;

        var a = null;
        var frag = null;

        var left = a1.p.x < a2.p.x ? a1 : a2;
        if (a1.p.x > a2.p.x) {
            var t = a1;
            a1 = a2;
            a2 = t;
        }

        var delta = org.helm.webeditor.bondscale * this.jsd.bondlength;

        var bt1 = a1.biotype();
        var bt2 = a2.biotype();
        if (bt1 == org.helm.webeditor.HELM.LINKER && bt2 == org.helm.webeditor.HELM.SUGAR || bt1 == org.helm.webeditor.HELM.SUGAR && bt2 == org.helm.webeditor.HELM.LINKER || bt1 == org.helm.webeditor.HELM.SUGAR && bt2 == org.helm.webeditor.HELM.SUGAR ||
            bt1 == org.helm.webeditor.HELM.AA && bt2 == org.helm.webeditor.HELM.AA) {
            var f = false;
            if (this.hasSpareR(a1, 2) && this.hasSpareR(a2, 1)) {
                f = true;
            }
            else if (this.hasSpareR(a2, 2) && this.hasSpareR(a1, 1)) {
                var t = a1;
                a1 = a2;
                a2 = t;

                f = true;
            }

            if (f) {
                frag = this.jsd.getFragment(a2);
                if (bt1 == org.helm.webeditor.HELM.AA) {
                    b = this.addBond(a1, a2, 2, 1);
                }
                else {
                    if (bt1 != bt2 || !this.needLinker()) {
                        b = this.addBond(a1, a2, 2, 1);
                    }
                    else {
                        a = this.addNode(org.helm.webeditor.Interface.createPoint(left.p.x + delta, left.p.y), org.helm.webeditor.HELM.LINKER, this.getDefaultNodeType(org.helm.webeditor.HELM.LINKER));
                        b = this.addBond(a1, a, 2, 1);
                        if (b != null)
                            b = this.addBond(a, a2, 2, 1);
                    }
                }

                this.finishConnect(extendchain, b, a, a1, a2, frag, delta);
                return;
            }
        }
        else if (bt1 == org.helm.webeditor.HELM.SUGAR && bt2 == org.helm.webeditor.HELM.BASE || bt2 == org.helm.webeditor.HELM.SUGAR && bt1 == org.helm.webeditor.HELM.BASE) {
            if (bt2 == org.helm.webeditor.HELM.SUGAR) {
                var t = a1;
                a1 = a2;
                a2 = t;
            }
            var b = this.addBond(a1, a2, 3, 1);
            if (b != null) {
                a2.p = org.helm.webeditor.Interface.createPoint(a1.p.x, a1.p.y + Math.abs(delta));
                this.finishConnect(false, b, null, b.a1);
            }
            return;
        }

        var rs1 = this.getSpareRs(a1);
        var rs2 = this.getSpareRs(a2);
        if ((rs1 == null || rs2 == null)) {
            if (this.canPair(a1, a2) && this.jsd.m.findBond(a1, a2) == null) {
                // hydrogen bond
                org.helm.webeditor.Interface.createBond(this.jsd.m, a1, a2, JSDraw2.BONDTYPES.UNKNOWN);
                this.finishConnect(extendchain);
            }
            else {
                var s = "";
                if (rs1 == null && rs2 == null)
                    s = "Both monomers don't";
                else if (rs1 == null)
                    s = "Monomer, " + a1.elem + (a1.bio.id == null ? "" : a1.bio.id) + ", doesn't";
                else if (rs2 == null)
                    s = "Monomer, " + a2.elem + (a2.bio.id == null ? "" : a2.bio.id) + ", doesn't";
                scil.Utils.alert(s + " have any connecting point available");
                this.finishConnect(extendchain);
            }
            return;
        }

        if (rs1.length <= 1 && rs2.length <= 1) {
            if (bt1 == org.helm.webeditor.HELM.LINKER)
                bt1 = org.helm.webeditor.HELM.SUGAR;
            if (bt2 == org.helm.webeditor.HELM.LINKER)
                bt2 = org.helm.webeditor.HELM.SUGAR;

            // https://github.com/PistoiaHELM/HELMWebEditor/issues/101
            // prevent head-to-head and tail-to-tail connection
            if (!org.helm.webeditor.allowHeadToHeadConnection) {
                if (bt1 == bt2 && (bt1 == org.helm.webeditor.HELM.SUGAR || bt1 == org.helm.webeditor.HELM.AA) && rs1[0] == rs2[0] && (rs1[0] == 1 || rs1[0] == 2)) {
                    scil.Utils.alert("head-to-head / tail-to-tail connection is not allowed");
                    return;
                }
            }

            frag = this.jsd.getFragment(a2);
            b = this.addBond(a1, a2, rs1[0], rs2[0]);
        }
        else {
            if (extendchain)
                this.jsd.refresh();

            var me = this;
            this.chooseRs(rs1, rs2, a1, a2, function (r1, r2) {
                frag = me.jsd.getFragment(a2);
                b = me.addBond(a1, a2, r1, r2);
                me.finishConnect(extendchain, b, a1, a1, a2, frag, delta);
            });
            return;
        }

        this.finishConnect(extendchain, b, a, a1, a2, frag, delta);
    },

    canPair: function (a1, a2) {
        if (a1.biotype() == org.helm.webeditor.HELM.BASE && a2.biotype() == org.helm.webeditor.HELM.BASE) {
            var c1 = a1.elem;
            var c2 = a2.elem;
            return c1 == "A" && (c2 == "T" || c2 == "U") || (c1 == "T" || c1 == "U") && c2 == "A" ||
                c1 == "G" && c2 == "C" || c1 == "C" && c2 == "G";
        }
        return false;
    },

    needLinker: function () {
        var linker = this.getDefaultNodeType(org.helm.webeditor.HELM.LINKER);
        return linker != "null";
    },

    finishConnect: function (extendchain, b, a, a1, a2, frag, delta) {
        this.clean();
        this.jsd.refresh(extendchain || b != null);
    },

    chooseRs: function (rs1, rs2, a1, a2, callback) {
        if (this.chooseRDlg == null) {
            var me = this;
            var fields = {
                s1: { label: "Monomer 1", type: "jsdraw", width: 240, height: 150, viewonly: true, style: { border: "solid 1px gray"} },
                r1: { type: "select", width: 120 },
                g: { type: "div" },
                s2: { label: "Monomer 2", type: "jsdraw", width: 240, height: 150, viewonly: true, style: { border: "solid 1px gray"} },
                r2: { type: "select", width: 120 }
            };
            this.chooseRDlg = scil.Form.createDlgForm("Choose Connecting Points", fields, { label: "OK", width: 240, onclick: function () { me.chooseRs2(); } });
        }

        this.chooseRDlg.callback = callback;
        this.chooseRDlg.show2({ owner: this.jsd });
        this._listRs(this.chooseRDlg.form.fields.r1, rs1, 2);
        this._listRs(this.chooseRDlg.form.fields.r2, rs2, 1);

        this.chooseRDlg.form.fields.r1.disabled = rs1.length <= 1;
        this.chooseRDlg.form.fields.r2.disabled = rs2.length <= 1;

        var m1 = org.helm.webeditor.Monomers.getMonomer(a1);
        var m2 = org.helm.webeditor.Monomers.getMonomer(a2);
        this.chooseRDlg.form.fields.s1.jsd.setMolfile(org.helm.webeditor.Monomers.getMolfile(m1));
        this.chooseRDlg.form.fields.s2.jsd.setMolfile(org.helm.webeditor.Monomers.getMolfile(m2));

        var tr1 = scil.Utils.getParent(this.chooseRDlg.form.fields.s1, "TR");
        var tr2 = scil.Utils.getParent(this.chooseRDlg.form.fields.s2, "TR");
        tr1.childNodes[0].innerHTML = a1.elem + (a1.bio == null || a1.bio.id == null ? "" : a1.bio.id);
        tr2.childNodes[0].innerHTML = a2.elem + (a2.bio == null || a2.bio.id == null ? "" : a2.bio.id);

        this.chooseRDlg.rs1 = rs1;
        this.chooseRDlg.rs2 = rs2;
    },

    chooseRs2: function () {
        var d = this.chooseRDlg.form.getData();
        if (scil.Utils.isNullOrEmpty(d.r1) && this.chooseRDlg.rs1.length > 0 || scil.Utils.isNullOrEmpty(d.r2) && this.chooseRDlg.rs2.length > 0) {
            scil.Utils.alert("Please select Rs for both Nodes");
            return;
        }

        this.chooseRDlg.hide();
        this.chooseRDlg.callback(d.r1 == null || d.r1 == "?" ? d.r1 : parseInt(d.r1), d.r2 == null || d.r2 == "?" ? d.r2 : parseInt(d.r2));
    },

    _listRs: function (sel, list, v) {
        var ss = {};
        for (var i = 0; i < list.length; ++i)
            ss[list[i] + ""] = list[i] == "?" ? "?" : ("R" + list[i]);
        scil.Utils.listOptions(sel, ss, v == null ? null : (v + ""), true, false);
    },

    changeMonomer: function (a, cloned) {
        var s = this.getDefaultNodeType(a.biotype());
        if (!scil.Utils.isNullOrEmpty(s) && a.elem != s && s != "null" && a.biotype() != org.helm.webeditor.HELM.BLOB) {
            this.jsd.pushundo(cloned);
            this.setNodeType(a, a.biotype(), s);
            this.jsd.refresh(true);
        }
        else {
            scil.Utils.beep();
        }
    },

    extendChain: function (a1, cmd, p1, p2, cloned) {
        var rs = [];
        var rgroups = this.getSpareRs(a1, rs);
        if (rgroups == null) {
            scil.Utils.alert("No connecting points available");
            this.jsd.redraw();
            return;
        }

        var delta = p2.x > p1.x ? org.helm.webeditor.bondscale * this.jsd.bondlength : -org.helm.webeditor.bondscale * this.jsd.bondlength;
        var p = org.helm.webeditor.Interface.createPoint(a1.p.x + delta, a1.p.y);

        var a2 = null;
        var r1 = null;
        var r2 = null;
        var bond = null;
        if (cmd == "helm_chem") {
            if (Math.abs(p2.y - p1.y) / Math.abs(p2.x - p1.x) > 5)
                p = org.helm.webeditor.Interface.createPoint(a1.p.x, a1.p.y + Math.abs(delta) * (p2.y > p1.y ? 1 : -1));
            a2 = this.addNode(p, org.helm.webeditor.HELM.CHEM, this.getDefaultNodeType(org.helm.webeditor.HELM.CHEM));
            if (a2 != null) {
                this.connectFragment(a1, a2, true);
                return;
            }
        }
        else if (cmd == "helm_aa") {
            if (Math.abs(p2.y - p1.y) / Math.abs(p2.x - p1.x) > 5)
                p = org.helm.webeditor.Interface.createPoint(a1.p.x, a1.p.y + Math.abs(delta) * (p2.y > p1.y ? 1 : -1));
            a2 = this.addNode(p, org.helm.webeditor.HELM.AA, this.getDefaultNodeType(org.helm.webeditor.HELM.AA));
        }
        else if (cmd == "helm_linker") {
            a2 = this.addNode(p, org.helm.webeditor.HELM.LINKER, this.getDefaultNodeType(org.helm.webeditor.HELM.LINKER));
        }
        else if (cmd == "helm_sugar") {
            a2 = this.addNode(p, org.helm.webeditor.HELM.SUGAR, this.getDefaultNodeType(org.helm.webeditor.HELM.SUGAR));
        }
        else if (cmd == "helm_base") {
            if (a1.biotype() == org.helm.webeditor.HELM.SUGAR && this.hasSpareR(a1, 3)) {
                r1 = 3;
                r2 = 1;
                p = org.helm.webeditor.Interface.createPoint(a1.p.x, a1.p.y + Math.abs(delta));
                a2 = this.addNode(p, org.helm.webeditor.HELM.BASE, this.getDefaultNodeType(org.helm.webeditor.HELM.BASE));
            }
        }
        else if (cmd == "helm_nucleotide" || cmd == "helm_sugar") {
            if (Math.abs(p2.y - p1.y) / Math.abs(p2.x - p1.x) > 5) {
                // drag vertically to add base
                if (a1.biotype() == org.helm.webeditor.HELM.SUGAR && rs[3] == true) {
                    r1 = 3;
                    r2 = 1;
                    p = org.helm.webeditor.Interface.createPoint(a1.p.x, a1.p.y + Math.abs(delta));
                    a2 = this.addNode(p, org.helm.webeditor.HELM.BASE, this.getDefaultNodeType(org.helm.webeditor.HELM.BASE));
                }
            }
            else {
                if (rs[1] == true || rs[2] == true) {
                    var m = this.getDefaultNodeType(org.helm.webeditor.HELM.SUGAR);
                    var e = this.getDefaultNodeType(org.helm.webeditor.HELM.LINKER);
                    var linker = null;
                    var sugar = null;

                    if (delta < 0) {
                        if (rs[1])
                            r1 = 1;
                        else
                            r1 = 2;
                    }
                    else {
                        if (rs[2])
                            r1 = 2;
                        else
                            r1 = 1;
                    }
                    r2 = r1 == 1 ? 2 : 1;

                    if (r1 == 1) {
                        if (e != "null") {
                            linker = this.addNode(p.clone(), org.helm.webeditor.HELM.LINKER, e);
                            p.x += delta;
                        }
                        sugar = this.addNode(p.clone(), org.helm.webeditor.HELM.SUGAR, m);

                        if (linker != null) {
                            bond = this.addBond(a1, linker, r1, r2);
                            this.addBond(linker, sugar, r1, r2);
                        }
                        else {
                            bond = this.addBond(a1, sugar, r1, r2);
                        }
                    }
                    else {
                        sugar = this.addNode(p.clone(), org.helm.webeditor.HELM.SUGAR, m);
                        p.x += delta;
                        if (e != "null")
                            linker = this.addNode(p.clone(), org.helm.webeditor.HELM.LINKER, e);

                        if (linker != null) {
                            bond = this.addBond(a1, sugar, r1, r2);
                            this.addBond(sugar, linker, r1, r2);
                        }
                        else {
                            bond = this.addBond(a1, sugar, r1, r2);
                        }
                    }

                    var base = null;
                    if (cmd == "helm_nucleotide" && org.helm.webeditor.Monomers.hasR(org.helm.webeditor.HELM.SUGAR, m, "R3")) {
                        base = this.addNode(sugar.p.clone(), org.helm.webeditor.HELM.BASE, this.getDefaultNodeType(org.helm.webeditor.HELM.BASE));
                        this.addBond(sugar, base, 3, 1);

                        var leftR = bond.a1.p.x < bond.a2.p.x ? bond.r1 : bond.r2;
                        if (leftR == 1) // reversed
                            base.p.y -= Math.abs(delta);
                        else
                            base.p.y += Math.abs(delta);
                    }

                    this.jsd.pushundo(cloned);
                    this.finishConnect(false, bond, null, a1);
                }
            }
        }

        if (a2 != null) {
            if (r1 == null || r2 == null) {
                if (this.hasSpareR(a1, 2) && !this.hasSpareR(a1, 1)) {
                    r1 = 2;
                    r2 = 1;
                }
                else if (this.hasSpareR(a1, 1) && !this.hasSpareR(a1, 2)) {
                    r1 = 1;
                    r2 = 2;
                }
                else {
                    r1 = delta > 0 ? 2 : 1;
                    r2 = r1 == 2 ? 1 : 2;
                }
            }
            bond = this.addBond(a1, a2, r1, r2);
        }

        if (bond != null) {
            this.jsd.pushundo(cloned);
            this.finishConnect(false, bond, null, a1);
        }
        else {
            this.jsd.refresh();
        }
    },

    /**
    * Get HELM
    * @function getHelm
    * @param {bool} highlightselection - internal use only, using null always
    * @returns the HELM as string
    */
    getHelm: function (highlightselection) {
        return org.helm.webeditor.IO.getHelm(this.jsd.m, highlightselection);
    },

    /**
    * Get sequence of natuaral analogue
    * @function getSequence
    * @param {bool} highlightselection - internal use only, using null always
    * @returns the sequence as a string
    */
    getSequence: function (highlightselection) {
        return org.helm.webeditor.IO.getSequence(this.jsd.m, highlightselection);
    },

    /**
    * Get XHELM
    * @function getXHelm
    * @returns XHELM as a string
    */
    getXHelm: function () {
        return org.helm.webeditor.IO.getXHelm(this.jsd.m);
    },

    /**
    * Set HELM
    * @function getSequence
    * @param {string} s - The HELM string
    * @param {string} renamedmonomers - internal use only, using null always
    */
    setHelm: function (s, renamedmonomers) {
        this.jsd.clear();

        var n = 0;
        try {
            if (!scil.Utils.isNullOrEmpty(s))
                n = org.helm.webeditor.IO.read(this, s, "HELM", renamedmonomers);
        }
        catch (e) {
            this.jsd.clear();
            return;
        }

        if (n > 0) {
            this.clean();
            this.jsd.fitToWindow();
            this.jsd.refresh();
        }
    },

    /**
    * Set XHELM 
    * @function setXHelm
    * @param {string} s - the xhelm string
    */
    setXHelm: function (s) {
        var doc = typeof (s) == "string" ? scil.Utils.parseXml(s) : s;
        if (doc == null)
            return false;

        var es = doc.getElementsByTagName("HelmNotation");
        if (es == null || es.length == 0)
            return false;

        var s = scil.Utils.getInnerText(es[0]);

        var list = doc.getElementsByTagName("Monomers");
        if (list == null || list.length == 0) {
            this.setHelm(s);
            return;
        }

        var me = this;
        org.helm.webeditor.monomers.loadMonomers(list[0], function (renamed) {
            if (me.monomerexplorer != null)
                me.monomerexplorer.reloadTabs();
            me.setHelm(s, renamed);
        });
    },

    isXHelm: function (doc) {
        var ret = doc == null ? null : doc.getElementsByTagName("Xhelm");
        return ret != null && ret.length == 1;
    },

    /**
    * Show Importing Sequence dialog
    * @function showImportDlg
    */
    showImportDlg: function () {
        if (this.inputSeqDlg == null) {
            var fields = {
                type: { label: "Sequence Type", type: "select", items: ["HELM", "Peptide", "RNA"] },
                sequence: { label: "Sequence", type: "textarea", width: 800, height: 50 },
                separator: { label: "Separator", width: 100, str: "(Legacy sequences with dedicated separator, e.g. dC.dA.xE)" }
            };

            var me = this;
            this.inputSeqDlg = scil.Form.createDlgForm("Import Sequence", fields, [
                { label: "Import", onclick: function () { me.importSequence(false); } },
                { label: "Append", onclick: function () { me.importSequence(true); } }
            ]);
        }

        this.inputSeqDlg.show2({ owner: this.jsd });
    },

    importSequence: function (append) {
        var data = this.inputSeqDlg.form.getData();
        if (this.setSequence(data.sequence, data.type, null, null, append, data.separator))
            this.inputSeqDlg.hide();
    },

    /**
    * Set a sequence (natural analogue sequence, HELM,)
    * @function setSequence
    * @param {string} seq - the input sequence
    * @param {string} format - input format: HELM, RNA, Peptide, or null
    * @param {string} sugar - the sugar for RNA
    * @param {string} linker - the linker for RNA
    * @param {bool} append - set the sequence in appending mode or overwriting mode
    */
    setSequence: function (seq, format, sugar, linker, append, separator) {
        var seq = scil.Utils.trim(seq);
        if (/^[a-z]+$/.test(seq))
            seq = seq.toUpperCase();

        var n = 0;
        var cloned = this.jsd.clone();
        this.jsd.clear();
        //try {
        n = org.helm.webeditor.IO.read(this, seq, format, null, sugar, linker, separator);
        //        }
        //        catch (e) {
        //            this.jsd.restoreClone(cloned);
        //            var s = e.message == null ? e : e.message;
        //            if (!scil.Utils.isNullOrEmpty(s))
        //                scil.Utils.alert("Error: " + s);
        //            return false;
        //        }

        if (n > 0) {
            this.jsd.pushundo(cloned);

            this.clean();

            if (append) {
                var m = cloned.mol.clone();
                var rect = m.rect();
                var r2 = this.jsd.m.rect();
                if (r2 != null && rect != null)
                    this.jsd.m.offset(rect.center().x - r2.center().x, rect.bottom() + this.jsd.bondlength * 4 - r2.bottom());
                m.mergeMol(this.jsd.m);
                this.jsd.m = m;
            }

            this.jsd.fitToWindow();
            this.jsd.refresh(true);
        }
        return true;
    },

    /**
    * Clean the layout
    * @function clean
    * @param {JSDraw2.Atom} a - the start monomer.  Use null to clean all
    * @param {bool} redraw - indicate if redrawing the structure after cleaning
    */
    clean: function (a, redraw) {
        if (redraw)
            this.jsd.pushundo();

        org.helm.webeditor.Layout.clean(this.jsd, a);
        if (redraw) {
            this.jsd.moveCenter();
            this.jsd.refresh(true);
        }
    },

    /**
    * Reset monomer IDs 
    * @function resetIDs
    */
    resetIDs: function () {
        org.helm.webeditor.Layout.resetIDs(this.jsd.m);
    },

    dropMonomer: function (type, id, e) {
        var p = this.jsd.eventPoint(e);
        if (p.x <= 0 || p.y <= 0 || p.x >= this.jsd.dimension.x || p.y >= this.jsd.dimension.y || id == "null")
            return false;

        var f = false;
        if (this.jsd.curObject == null) {
            // create new monomer
            var cmd = type == "nucleotide" ? "helm_nucleotide" : scil.helm.symbolCase(type);
            if (this.isHelmCmd(cmd)) {
                p.offset(this.jsd.bondlength * 0.4, this.jsd.bondlength * 0.4);
                this.jsd.pushundo();
                var a = org.helm.webeditor.Interface.createAtom(this.jsd.m, p);
                this.createIsolatedMonomer(cmd, a);
                f = true;
            }
        }
        else {
            // modify the target monomer
            var set = org.helm.webeditor.Monomers.getMonomerSet(type);
            if (org.helm.webeditor.isAmbiguous(id, type)) {
                var a = org.helm.webeditor.Interface.getCurrentAtom(this.jsd);
                if (a == null || !org.helm.webeditor.isHelmNode(a) || a.biotype() != type || a.elem == id)
                    return false;
            }
            else {
                if (set == null || set[scil.helm.symbolCase(id)] == null)
                    return false;

                id = set[scil.helm.symbolCase(id)].id;
                var a = org.helm.webeditor.Interface.getCurrentAtom(this.jsd);
                if (a == null || !org.helm.webeditor.isHelmNode(a) || a.biotype() != type || a.elem == id)
                    return false;
            }
            this.jsd.pushundo();
            this.setNodeType(a, a.biotype(), id);
            f = true;
        }

        if (f)
            this.jsd.refresh(true);
        return f;
    },

    showFindReplaceDlg: function () {
        if (this.findDlg == null) {
            var fields = {
                finding: { label: "Find", width: 400, str: "<div>(Monomer symbol or position)</div>" },
                monomertype: { label: "Monomer Type", type: "select", sort: false, items: org.helm.webeditor.monomerTypeList() },
                replacewith: { label: "Replace With", width: 400 },
                selectedonly: { label: "Scope", type: "checkbox", str: "Search Selected Only" }
            };

            var me = this;
            this.findDlg = scil.Form.createDlgForm("Find and Replace", fields, [
                { label: "Find", onclick: function () { me.showFindReplaceDlg2("find"); } },
                { label: "Find All", onclick: function () { me.showFindReplaceDlg2("findall"); } },
                { label: "Replace All", onclick: function () { me.showFindReplaceDlg2("replaceall"); } }
            ])
        }

        this.findDlg.show2({ owner: this.jsd });
    },

    showFindReplaceDlg2: function (action) {
        var data = this.findDlg.form.getData();
        if (scil.Utils.isNullOrEmpty(data.finding) || action == "replaceall" && scil.Utils.isNullOrEmpty(data.replacewith)) {
            scil.Utils.alert("Find and Replace With cannot be blank");
            return;
        }

        if (action == "find")
            this.find(data.finding, false, data.monomertype, data.selectedonly);
        else if (action == "findall")
            this.find(data.finding, true, data.monomertype, data.selectedonly);
        else if (action == "replaceall")
            this.replaceAll(data.finding, data.replacewith, data.monomertype, data.selectedonly);
    },

    getSelectedAtoms: function () {
        var ret = [];
        var atoms = this.jsd.m.atoms;
        for (var i = 0; i < atoms.length; ++i) {
            if (atoms[i].selected)
                ret.push(atoms[i]);
        }
        return ret;
    },

    find: function (a, findall, monomertype, selectedonly) {
        var atoms = selectedonly ? this.getSelectedAtoms() : this.jsd.m.atoms;
        this.jsd.m.setSelected(false);

        var n = 0;
        var atom = null;
        if (/^[0-9]+$/.test(a)) {
            var aaid = parseInt(a);
            for (var i = 0; i < atoms.length; ++i) {
                if (atoms[i].bio != null && aaid == atoms[i].bio.id && (scil.Utils.isNullOrEmpty(monomertype) || monomertype == atoms[i].biotype())) {
                    ++n;
                    atoms[i].selected = true;
                    atom = atoms[i];
                    break;
                }
            }
        }
        else {
            for (var i = 0; i < atoms.length; ++i) {
                if (a == atoms[i].elem && (monomertype == "" || monomertype == atoms[i].biotype())) {
                    ++n;
                    atoms[i].selected = true;
                    if (!findall) {
                        atom = atoms[i];
                        break;
                    }
                }
            }
        }

        if (findall) {
            scil.Utils.alert(n + " node(s) found");
        }
        else {
            if (n == 0) {
                scil.Utils.alert("Cannot find " + a);
            }
            else {
                org.helm.webeditor.Interface.scaleCanvas(this.jsd);
                var dx = this.jsd.dimension.x / 2 - atom.p.x;
                var dy = this.jsd.dimension.y / 2 - atom.p.y;
                this.jsd.m.offset(dx, dy);
            }
        }

        if (n > 0)
            this.jsd.redraw();
    },

    replaceAll: function (a, a2, monomertype, selectedonly) {
        var n = 0;
        var cloned = this.jsd.clone();
        if (/^[0-9]+$/.test(a)) {
            var aaid = parseInt(a);
            var atoms = selectedonly ? this.getSelectedAtoms() : this.jsd.m.atoms;
            for (var i = 0; i < atoms.length; ++i) {
                if (atoms[i].bio != null && aaid == atoms[i].bio.id && (monomertype == "" || monomertype == atoms[i].biotype())) {
                    if (this.setNodeType(atoms[i], atoms[i].biotype(), a2))
                        ++n;
                    break;
                }
            }
        }
        else {
            n = this.replaceMonomer(monomertype, a, a2, selectedonly);
        }

        if (n > 0) {
            this.jsd.pushundo(cloned);
            this.jsd.refresh(true);
        }

        scil.Utils.alert(n + " node(s) replaced");
    },

    dblclickMomonor: function (type, monomer) {
        if (monomer == "null")
            return;

        var list = [];
        var atoms = this.jsd.m.atoms;
        for (var i = 0; i < atoms.length; ++i) {
            if (atoms[i].selected && atoms[i].biotype() == type && atoms[i].elem != monomer)
                list.push(atoms[i]);
        }

        if (list.length > 0) {
            this.jsd.pushundo();
            for (var i = 0; i < list.length; ++i)
                this.setNodeType(list[i], list[i].biotype(), monomer);
            this.jsd.refresh(true);
        }

        return list.length;
    },

    isHelmCmd: function (cmd) {
        return cmd == "helm_nucleotide" || cmd == "helm_base" || cmd == "helm_sugar" || cmd == "helm_chem" ||
            cmd == "helm_aa" || cmd == "helm_linker" || cmd == "helm_blob";
    },

    createIsolatedMonomer: function (cmd, a) {
        if (cmd == "helm_nucleotide") {
            var s = this.monomerexplorer == null ? null : scil.Utils.getInnerText(this.monomerexplorer.lastdiv);
            if (s == "*") {
                this.setNodeType(a, org.helm.webeditor.HELM.NUCLEOTIDE, "*");
                return true;
            }

            var m = this.getDefaultNodeType(org.helm.webeditor.HELM.SUGAR);
            this.setNodeType(a, org.helm.webeditor.HELM.SUGAR, m);

            if (org.helm.webeditor.Monomers.hasR(org.helm.webeditor.HELM.SUGAR, m, "R3")) {
                var a3 = this.addNode(org.helm.webeditor.Interface.createPoint(a.p.x, a.p.y + this.jsd.bondlength * org.helm.webeditor.bondscale), org.helm.webeditor.HELM.BASE, this.getDefaultNodeType(org.helm.webeditor.HELM.BASE));
                this.addBond(a, a3, 3, 1);
            }

            var linker = this.getDefaultNodeType(org.helm.webeditor.HELM.LINKER);
            if (linker == null || linker == "null")
                return;

            var a2 = this.addNode(org.helm.webeditor.Interface.createPoint(a.p.x + this.jsd.bondlength * org.helm.webeditor.bondscale, a.p.y), org.helm.webeditor.HELM.LINKER, linker);
            this.addBond(a, a2, 2, 1);
        }
        else if (cmd == "helm_base") {
            this.setNodeType(a, org.helm.webeditor.HELM.BASE, this.getDefaultNodeType(org.helm.webeditor.HELM.BASE));
        }
        else if (cmd == "helm_sugar") {
            this.setNodeType(a, org.helm.webeditor.HELM.SUGAR, this.getDefaultNodeType(org.helm.webeditor.HELM.SUGAR));
        }
        else if (cmd == "helm_linker") {
            this.setNodeType(a, org.helm.webeditor.HELM.LINKER, this.getDefaultNodeType(org.helm.webeditor.HELM.LINKER));
        }
        else if (cmd == "helm_aa") {
            this.setNodeType(a, org.helm.webeditor.HELM.AA, this.getDefaultNodeType(org.helm.webeditor.HELM.AA));
        }
        else if (cmd == "helm_chem") {
            this.setNodeType(a, org.helm.webeditor.HELM.CHEM, this.getDefaultNodeType(org.helm.webeditor.HELM.CHEM));
        }
        else if (cmd == "helm_blob") {
            this.setNodeType(a, org.helm.webeditor.HELM.BLOB, this.getDefaultNodeType(org.helm.webeditor.HELM.BLOB));
            this.setHelmBlobType(a, org.helm.webeditor.blobtypes[0]);
        }
        else {
            return false;
        }

        return true;
    }
});

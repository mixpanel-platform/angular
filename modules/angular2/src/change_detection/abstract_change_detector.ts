import {isPresent, BaseException} from 'angular2/src/facade/lang';
import {List, ListWrapper} from 'angular2/src/facade/collection';
import {ChangeDetectionUtil} from './change_detection_util';
import {ChangeDetectorRef} from './change_detector_ref';
import {DirectiveRecord} from './directive_record';
import {ChangeDetector, ChangeDispatcher} from './interfaces';
import {ChangeDetectionError} from './exceptions';
import {ProtoRecord} from './proto_record';
import {Locals} from './parser/locals';
import {Pipes} from './pipes/pipes';
import {CHECK_ALWAYS, CHECK_ONCE, CHECKED, DETACHED, ON_PUSH} from './constants';

class _Context {
  constructor(public element: any, public componentElement: any, public instance: any,
              public context: any, public locals: any, public injector: any,
              public expression: any) {}
}

export class AbstractChangeDetector<T> implements ChangeDetector {
  lightDomChildren: List<any> = [];
  shadowDomChildren: List<any> = [];
  parent: ChangeDetector;
  ref: ChangeDetectorRef;

  // The names of the below fields must be kept in sync with codegen_name_util.ts or
  // change detection will fail.
  alreadyChecked: any = false;
  context: T;
  currentProto: ProtoRecord = null;
  directiveRecords: List<DirectiveRecord>;
  dispatcher: ChangeDispatcher;
  locals: Locals = null;
  mode: string = null;
  pipes: Pipes = null;
  protos: List<ProtoRecord>;

  constructor(public id: string, dispatcher: ChangeDispatcher, protos: List<ProtoRecord>,
              directiveRecords: List<DirectiveRecord>, public modeOnHydrate: string) {
    this.ref = new ChangeDetectorRef(this);
    this.directiveRecords = directiveRecords;
    this.dispatcher = dispatcher;
    this.protos = protos;
  }

  addChild(cd: ChangeDetector): void {
    this.lightDomChildren.push(cd);
    cd.parent = this;
  }

  removeChild(cd: ChangeDetector): void { ListWrapper.remove(this.lightDomChildren, cd); }

  addShadowDomChild(cd: ChangeDetector): void {
    this.shadowDomChildren.push(cd);
    cd.parent = this;
  }

  removeShadowDomChild(cd: ChangeDetector): void { ListWrapper.remove(this.shadowDomChildren, cd); }

  remove(): void { this.parent.removeChild(this); }

  detectChanges(): void { this.runDetectChanges(false); }

  checkNoChanges(): void { throw new BaseException("Not implemented"); }

  runDetectChanges(throwOnChange: boolean): void {
    if (this.mode === DETACHED || this.mode === CHECKED) return;

    this.detectChangesInRecords(throwOnChange);

    this._detectChangesInLightDomChildren(throwOnChange);

    if (throwOnChange === false) this.callOnAllChangesDone();

    this._detectChangesInShadowDomChildren(throwOnChange);

    if (this.mode === CHECK_ONCE) this.mode = CHECKED;
  }

  // This method is not intended to be overridden. Subclasses should instead provide an
  // implementation of `detectChangesInRecordsInternal` which does the work of detecting changes
  // and which this method will call.
  // This method expects that `detectChangesInRecordsInternal` will set the property
  // `this.currentProto` to whichever [ProtoRecord] is currently being processed. This is to
  // facilitate error reporting.
  detectChangesInRecords(throwOnChange: boolean): void {
    if (!this.hydrated()) {
      ChangeDetectionUtil.throwDehydrated();
    }
    try {
      this.detectChangesInRecordsInternal(throwOnChange);
    } catch (e) {
      this.throwError(this.currentProto, e, e.stack);
    }
  }

  // Subclasses should override this method to perform any work necessary to detect and report
  // changes. For example, changes should be reported via `ChangeDetectionUtil.addChange`, lifecycle
  // methods should be called, etc.
  // This implementation should also set `this.currentProto` to whichever [ProtoRecord] is
  // currently being processed to facilitate error reporting. See {@link #detectChangesInRecords}.
  detectChangesInRecordsInternal(throwOnChange: boolean): void {}

  // This method is not intended to be overridden. Subclasses should instead provide an
  // implementation of `hydrateDirectives`.
  hydrate(context: T, locals: Locals, directives: any, pipes: any): void {
    this.mode = this.modeOnHydrate;
    this.context = context;
    this.locals = locals;
    this.pipes = pipes;
    this.hydrateDirectives(directives);
    this.alreadyChecked = false;
  }

  // Subclasses should override this method to hydrate any directives.
  hydrateDirectives(directives: any): void {}

  // This method is not intended to be overridden. Subclasses should instead provide an
  // implementation of `dehydrateDirectives`.
  dehydrate(): void {
    this.dehydrateDirectives(true);
    this.context = null;
    this.locals = null;
    this.pipes = null;
  }

  // Subclasses should override this method to dehydrate any directives. This method should reverse
  // any work done in `hydrateDirectives`.
  dehydrateDirectives(destroyPipes: boolean): void {}

  hydrated(): boolean { return this.context !== null; }

  callOnAllChangesDone(): void {}

  _detectChangesInLightDomChildren(throwOnChange: boolean): void {
    var c = this.lightDomChildren;
    for (var i = 0; i < c.length; ++i) {
      c[i].runDetectChanges(throwOnChange);
    }
  }

  _detectChangesInShadowDomChildren(throwOnChange: boolean): void {
    var c = this.shadowDomChildren;
    for (var i = 0; i < c.length; ++i) {
      c[i].runDetectChanges(throwOnChange);
    }
  }

  markAsCheckOnce(): void { this.mode = CHECK_ONCE; }

  markPathToRootAsCheckOnce(): void {
    var c: ChangeDetector = this;
    while (isPresent(c) && c.mode != DETACHED) {
      if (c.mode === CHECKED) c.mode = CHECK_ONCE;
      c = c.parent;
    }
  }

  throwError(proto: ProtoRecord, exception: any, stack: any): void {
    var c = this.dispatcher.getDebugContext(proto.bindingRecord.elementIndex, proto.directiveIndex);
    var context = isPresent(c) ? new _Context(c.element, c.componentElement, c.directive, c.context,
                                              c.locals, c.injector, proto.expressionAsString) :
                                 null;
    throw new ChangeDetectionError(proto, exception, stack, context);
  }
}

import fs from 'node:fs';

const typescriptPath = require.resolve('typescript')
const content = fs.readFileSync(typescriptPath, 'utf-8')

const patchedContent = content.replace('const checker = {',
  `const checker = {
  checkFileForBenchmark: (node) => {
    clear(potentialThisCollisions);
    clear(potentialNewTargetCollisions);
    clear(potentialWeakMapSetCollisions);
    clear(potentialReflectCollisions);
    clear(potentialUnusedRenamedBindingElementsInTypes);

    forEach(node.statements, checkSourceElement);
    checkSourceElement(node.endOfFileToken);

    checkDeferredNodes(node);

    if (isExternalOrCommonJsModule(node)) {
      registerForUnusedIdentifiersCheck(node);
    }

    addLazyDiagnostic(() => {
      // This relies on the results of other lazy diagnostics, so must be computed after them
      if (!node.isDeclarationFile && (compilerOptions.noUnusedLocals || compilerOptions.noUnusedParameters)) {
        checkUnusedIdentifiers(getPotentiallyUnusedIdentifiers(node), (containingNode, kind, diag) => {
          if (!containsParseError(containingNode) && unusedIsError(kind, !!(containingNode.flags & NodeFlags.Ambient))) {
            diagnostics.add(diag);
          }
        });
      }
      if (!node.isDeclarationFile) {
        checkPotentialUncheckedRenamedBindingElementsInTypes();
      }
    });

    if (
      compilerOptions.importsNotUsedAsValues === ImportsNotUsedAsValues.Error &&
      !node.isDeclarationFile &&
      isExternalModule(node)
    ) {
      checkImportsForTypeOnlyConversion(node);
    }

    if (isExternalOrCommonJsModule(node)) {
      checkExternalModuleExports(node);
    }

    if (potentialThisCollisions.length) {
      forEach(potentialThisCollisions, checkIfThisIsCapturedInEnclosingScope);
      clear(potentialThisCollisions);
    }

    if (potentialNewTargetCollisions.length) {
      forEach(potentialNewTargetCollisions, checkIfNewTargetIsCapturedInEnclosingScope);
      clear(potentialNewTargetCollisions);
    }

    if (potentialWeakMapSetCollisions.length) {
      forEach(potentialWeakMapSetCollisions, checkWeakMapSetCollision);
      clear(potentialWeakMapSetCollisions);
    }

    if (potentialReflectCollisions.length) {
      forEach(potentialReflectCollisions, checkReflectCollision);
      clear(potentialReflectCollisions);
    }
  },
  getDiagnosticsForBenchmark: (node) => {
    return diagnostics.getDiagnostics(node.fileName)
  },`
);

const patched = eval(`__filename = '${typescriptPath}';\n` + patchedContent);

(require.cache as Record<string, unknown>)[typescriptPath] = {
  exports: patched
}

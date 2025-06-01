import * as vscode from "vscode";
import processSingleFile from "../processFile";
import * as path from "path";

export const progressOptions: vscode.ProgressOptions = {
  location: vscode.ProgressLocation.Notification,
  title: "Transforming files",
  cancellable: false,
};

export async function processFiles(
  docs: vscode.TextDocument[],
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  // TODO: run asynchronously
  let i = 0;
  for (const doc of docs) {
    const origPath = doc.uri.fsPath;
    try {
      await processSingleFile(doc);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to transform ${path.basename(origPath)}`
      );
      continue;
    }

    i++;
    progress.report({
      message: path.basename(origPath),
      increment: Math.floor((i / docs.length) * 100),
    });
  }
  vscode.window.showInformationMessage(
    "All open files transformed to pseudo code!"
  );
}

export default async function onImportCommand() {
  const python_files = await vscode.workspace.findFiles("**/*.py");
  const pseudo_files = await vscode.workspace.findFiles("**/*.psu");

  let files: vscode.Uri[] = [];
  for (const file of python_files) {
    // only files that are not already pseudo code
    if (!pseudo_files.some((f) => f.fsPath === file.fsPath)) {
      files.push(file);
    }
  }

  if (files.length === 0) {
    vscode.window.showInformationMessage(
      "No Python files to transform to pseudo code."
    );
    return;
  }

  const docs = await Promise.all(
    files.map(async (file) => {
      return await vscode.workspace.openTextDocument(file);
    })
  );

  if (docs.length === 0) {
    vscode.window.showInformationMessage("No files to transform.");
    return;
  }

  await vscode.window.withProgress(progressOptions, (progress) =>
    processFiles(docs, progress)
  );
}

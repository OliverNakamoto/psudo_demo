
import * as vscode from "vscode";
import processSingleFile from "../processFile";

export default async function onSave(
  document: vscode.TextDocument,
  diffString?: string
): Promise<void> {
  if (document.getText().trim() === "") return;

  if (diffString) {
    await processSingleFile(document, diffString);
  }
  else {
    await processSingleFile(document);
  }

  // await processSingleFile(document);
}
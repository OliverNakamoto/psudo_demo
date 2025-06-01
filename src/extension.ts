
import * as vscode from "vscode";
import onImportCommand from "./actions/importCommand";
import onSave from "./actions/onSave";
import * as diff from "diff";
import { promises as fs } from "fs";

export function activate(context: vscode.ExtensionContext): void {

  //save the diff for each file that is relevant, to be used in the save-activated synching
  const diffMap = new Map<string, string>();

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(async (e) => {
      const doc = e.document;
      const filePath = doc.uri.fsPath;

      // 1) load the old content from disk
      const oldText = await fs.readFile(filePath, "utf8");
      // 2) get the new text (in‐editor changes)
      const newText = doc.getText();

      const changes = diff.diffLines(oldText, newText);
      
      let line = 1;

      let diffString = "";
      let diffOrig = "";

      for (const part of changes) {
        const lines = part.value.split("\n");

        lines.forEach((content) => {
          if (content.trim() === "") return;

          diffOrig += content + "\n";

          const prefix = part.added ? '+' : part.removed ? '-' : ' ';
          diffString += `${prefix} ${String(line).padStart(4)} | ${content}\n`;

          if (!part.removed) {
            line++;
          }
        });
      }

      if (diffString.trim()) {
        diffMap.set(filePath, diffString);
      }

      console.log("initial Diff:\n" + diffOrig);
      console.log("Final Diff:\n" + diffString);
      

      // (optionally) show the diff in a notification, output channel, etc.
    })
  );




  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      vscode.window.showInformationMessage(
        `Triggered on save for ${document.fileName}`
      );
      const filePath = document.uri.fsPath;
      const diffString = diffMap.get(filePath);
      // let empty_check = true;
      // if (diffString === "") {
      //   empty_check = false;
      // }
      // console.log("Diff String: " + diffString);

      if (diffString) {
        // pass the diff into onSave
        await onSave(document, diffString);
        diffMap.delete(filePath);
      } else {
        // no diff: fall back to normal behavior
        await onSave(document);
      }
      // await onSave(document);
    })
  );






  
  // On command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.transformOpenToText",
      onImportCommand
    )
  );
  // indicate that the extension is activated
  vscode.window.showInformationMessage("Pseudo extension activated!");
}

export function deactivate(): void {}
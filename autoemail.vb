Option Explicit
Private WithEvents inboxItems As Outlook.Items
Private Sub Application_Startup()
  Dim olApp As Outlook.Application
  Dim olnamespace As Outlook.NameSpace
  Set olApp = Outlook.Application
  Set olnamespace = olApp.GetNamespace("MAPI")
  Set inboxItems = olnamespace.GetDefaultFolder(olFolderInbox).Folders("Active").Items
End Sub
Private Sub inboxItems_ItemAdd(ByVal Item As Object)
On Error GoTo ErrorHandler
 
Dim olApp As Outlook.Application
Dim olnamespace As Outlook.NameSpace
Dim olActiveFolder As Folder
Dim ticketnumber As String
Dim rightsubject As String
Dim leftsubject As String
Dim extsubject As String
Set olApp = Outlook.Application
Set olnamespace = olApp.GetNamespace("MAPI")
Set olActiveFolder = olnamespace.GetDefaultFolder(olFolderInbox).Folders("Active")
 
If TypeName(Item) = "MailItem" Then
   Debug.Print "triggered"
   ticketnumber = Item.Subject
   rightsubject = Right(ticketnumber, 16)
   leftsubject = Left(ticketnumber, 60)
   olActiveFolder.Folders.Add (rightsubject & " - " & leftsubject)
End If
 
 
ExitNewItem:
    Exit Sub
ErrorHandler:
    MsgBox Err.Number & " - " & Err.Description
    Resume ExitNewItem
End Sub

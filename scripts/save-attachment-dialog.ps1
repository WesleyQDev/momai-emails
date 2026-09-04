param(
    [Parameter(Mandatory=$true)][string]$SourcePath,
    [Parameter(Mandatory=$false)][string]$InitialFileName = ""
)

$ErrorActionPreference = 'Stop'

try {
    if (-not (Test-Path $SourcePath)) {
        Write-Error "Source file not found: $SourcePath"
        exit 1
    }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $sourceItem = Get-Item $SourcePath
    $fileName = if ($InitialFileName) { $InitialFileName } else { $sourceItem.Name }
    $extension = [System.IO.Path]::GetExtension($fileName).ToLower()

    $filter = switch ($extension) {
        '.pdf'  { "Documento PDF (*.pdf)|*.pdf|Todos os Arquivos (*.*)|*.*" }
        '.docx' { "Documento do Word (*.docx)|*.docx|Todos os Arquivos (*.*)|*.*" }
        '.doc'  { "Documento do Word (*.doc)|*.doc|Todos os Arquivos (*.*)|*.*" }
        '.xlsx' { "Planilha do Excel (*.xlsx)|*.xlsx|Todos os Arquivos (*.*)|*.*" }
        '.xls'  { "Planilha do Excel (*.xls)|*.xls|Todos os Arquivos (*.*)|*.*" }
        '.pptx' { "Apresentação PowerPoint (*.pptx)|*.pptx|Todos os Arquivos (*.*)|*.*" }
        '.png'  { "Imagem PNG (*.png)|*.png|Todos os Arquivos (*.*)|*.*" }
        '.jpg'  { "Imagem JPEG (*.jpg;*.jpeg)|*.jpg;*.jpeg|Todos os Arquivos (*.*)|*.*" }
        '.jpeg' { "Imagem JPEG (*.jpg;*.jpeg)|*.jpg;*.jpeg|Todos os Arquivos (*.*)|*.*" }
        '.zip'  { "Arquivo ZIP (*.zip)|*.zip|Todos os Arquivos (*.*)|*.*" }
        default { "Arquivos (*$extension)|*$extension|Todos os Arquivos (*.*)|*.*" }
    }

    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Title = "Salvar anexo como..."
    $dialog.FileName = $fileName
    $dialog.Filter = $filter
    $dialog.FilterIndex = 1
    $dialog.RestoreDirectory = $true
    $dialog.OverwritePrompt = $true

    $downloadsPath = [System.IO.Path]::Combine($env:USERPROFILE, "Downloads")
    if (Test-Path $downloadsPath) {
        $dialog.InitialDirectory = $downloadsPath
    }

    # Use an invisible dummy top-most form to bring the dialog to the front of MomAI
    $form = New-Object System.Windows.Forms.Form
    $form.TopMost = $true
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.Size = New-Object System.Drawing.Size(1, 1)
    $form.Opacity = 0
    $form.ShowInTaskbar = $false
    $form.Show()

    $result = $dialog.ShowDialog($form)
    $form.Close()
    $form.Dispose()

    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        $destPath = $dialog.FileName
        Copy-Item -Path $SourcePath -Destination $destPath -Force
        Write-Output "SAVED:$destPath"
    } else {
        Write-Output "CANCELLED"
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}

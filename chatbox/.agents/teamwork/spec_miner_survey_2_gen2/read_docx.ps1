Add-Type -AssemblyName System.IO.Compression.FileSystem
$docFile = (Get-ChildItem docs\spec -Filter "*tr*.docx").FullName
$zip = [System.IO.Compression.ZipFile]::OpenRead($docFile)
$entry = $zip.GetEntry('word/document.xml')
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$text = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()

$clean = [System.Text.RegularExpressions.Regex]::Replace($text, '<[^>]+>', ' ')
$clean = [System.Text.RegularExpressions.Regex]::Replace($clean, '\s+', ' ')
[System.IO.File]::WriteAllText('.agents\teamwork\spec_miner_survey_2_gen2\cau_tra_loi_text.txt', $clean, [System.Text.Encoding]::UTF8)
Write-Output "Extracted successfully"

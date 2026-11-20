using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

// Validate <folder>: every .docx under the folder against the Office 2019 schema, the files
// Word itself writes, one line per error; exits 1 when there is any.
var root = args.Length > 0 ? args[0] : "/docs";
var validator = new OpenXmlValidator(FileFormatVersions.Office2019);
var errors = 0;
foreach (var path in Directory.EnumerateFiles(root, "*.docx", SearchOption.AllDirectories).Order())
{
    var name = Path.GetRelativePath(root, path);
    try
    {
        using var document = WordprocessingDocument.Open(path, false);
        var found = validator.Validate(document).ToList();
        errors += found.Count;
        Console.WriteLine($"{name}\t{found.Count}");
        foreach (var error in found)
        {
            Console.WriteLine($"  {error.Part?.Uri}\t{error.Path?.XPath}\t{error.Id}\t{error.Description}");
        }
    }
    catch (Exception exception)
    {
        errors += 1;
        Console.WriteLine($"{name}\tunreadable\t{exception.Message}");
    }
}
Console.WriteLine($"TOTAL\t{errors}");
return errors == 0 ? 0 : 1;

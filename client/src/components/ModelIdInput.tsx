import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { CouncilMemberTuning } from "@shared/domain/councilMemberTuning";
import { ModelTuningPanel } from "@/components/ModelTuningPanel";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import { autocompleteModels, validateModel } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { z } from "zod";
import { modelAutocompleteSuggestionSchema } from "@/lib/apiSchemas";

interface ModelIdInputProps {
  value: string;
  onChange: (value: string) => void;
  tuning: CouncilMemberTuning;
  onTuningChange: (tuning: CouncilMemberTuning) => void;
  disabled?: boolean;
}

type Suggestion = z.infer<typeof modelAutocompleteSuggestionSchema>;

export function ModelIdInput({
  value,
  onChange,
  tuning,
  onTuningChange,
  disabled = false,
}: ModelIdInputProps) {
  const { authHeader } = useAuth();
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  const debouncedValue = useDebounce(value, 300);

  useEffect(() => {
    if (disabled) {
      setIsValid(null);
      setIsValidating(false);
      return;
    }

    setIsValid(null);
  }, [value, disabled]);

  // Validation query
  const { data: validationData, isLoading: isValidationLoading } = useQuery({
    queryKey: ["model-validate", debouncedValue, authHeader],
    queryFn: async () => {
      if (!authHeader) throw new Error("Missing authentication");
      return validateModel({ authHeader, modelId: debouncedValue });
    },
    enabled: !disabled && !!authHeader && debouncedValue.length > 0,
    refetchOnWindowFocus: false,
  });

  const validationModel = validationData?.model ?? null;
  const validationModelCapabilities = (() => {
    if (!validationModel) return [];
    const caps: string[] = [];
    const params = validationModel.supportedParameters;
    if (params.includes("tools")) caps.push("tools");
    if (params.includes("response_format") || params.includes("structured_outputs")) caps.push("structured");
    if (params.includes("reasoning") || params.includes("include_reasoning")) caps.push("reasoning");
    if (validationModel.inputModalities.includes("image")) caps.push("vision");
    return caps;
  })();
  
  // Autocomplete query
  const { data: autocompleteData, isLoading: isAutocompleteLoading } = useQuery({
    queryKey: ["model-autocomplete", debouncedValue, authHeader],
    queryFn: async () => {
      if (!authHeader) throw new Error("Missing authentication");
      return autocompleteModels({ authHeader, query: debouncedValue, limit: 10 });
    },
    enabled: !disabled && !!authHeader && debouncedValue.length >= 2 && showSuggestions,
    refetchOnWindowFocus: false,
  });
  
  // Update validation state
  useEffect(() => {
    if (validationData) {
      setIsValid(validationData.valid);
      setIsValidating(false);
    }
  }, [validationData]);
  
  // Update suggestions
  useEffect(() => {
    if (autocompleteData?.suggestions) {
      setSuggestions(autocompleteData.suggestions);
    }
  }, [autocompleteData]);
  
  // Show loading state when debounced value changes
  useEffect(() => {
    if (disabled) {
      setIsValidating(false);
      return;
    }

    setIsValidating(debouncedValue.length > 0);
  }, [debouncedValue, disabled]);

  useEffect(() => {
    if (!disabled) return;
    setShowSuggestions(false);
    setSelectedIndex(-1);
  }, [disabled]);
  
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };
  
  const handleInputFocus = () => {
    if (disabled) return;
    if (value.length >= 2) {
      setShowSuggestions(true);
    }
  };
  
  const handleSuggestionClick = (suggestion: Suggestion) => {
    onChange(suggestion.modelId);
    setShowSuggestions(false);
    setIsValid(true);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };
  
  const getValidationIcon = () => {
    if (disabled) return null;
    if (isValidating || isValidationLoading) {
      return <Loader2 className="animate-spin icon-sm text-muted-foreground" />;
    }
    if (isValid === true) {
      return <CheckCircle2 className="icon-sm text-evergreen" />;
    }
    if (isValid === false) {
      return <XCircle className="icon-sm text-destructive" />;
    }
    return null;
  };
  
  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="e.g., openai/gpt-4-turbo"
          disabled={disabled}
          aria-invalid={isValid === false ? true : undefined}
          data-valid={isValid === true ? "true" : undefined}
          className="control-has-icon-right"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {getValidationIcon()}
        </div>
      </div>
      
      {/* Validation message */}
      {!disabled && isValid === false && (
        <p className="text-xs text-destructive mt-1">
          Model ID not found in OpenRouter catalog cache
        </p>
      )}
      {!disabled && isValid === true && (
        <p className="text-xs text-evergreen mt-1">
          Valid model ID
        </p>
      )}

      {!disabled && isValid === true && validationModelCapabilities.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Features: {validationModelCapabilities.join(", ")}
        </p>
      )}

      {!disabled && isValid === true && validationModel && (
        <p className="text-xs text-muted-foreground mt-1">
          Context:{" "}
          {validationModel.contextLength !== null
            ? `${validationModel.contextLength.toLocaleString()} tokens`
            : "unknown"}
          {validationModel.maxCompletionTokens !== null
            ? ` • Max completion: ${validationModel.maxCompletionTokens.toLocaleString()} tokens`
            : ""}
        </p>
      )}

      {!disabled && isValid === true && validationModel && (
        <ModelTuningPanel
          supportedParameters={validationModel.supportedParameters}
          tuning={tuning}
          onTuningChange={onTuningChange}
          disabled={disabled}
        />
      )}
	      
      {/* Autocomplete suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="popover absolute z-50 w-full mt-1 max-h-60 overflow-auto"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.modelId}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={`w-full text-left px-3 py-2 hover:bg-accent transition-colors ${
                index === selectedIndex ? "bg-accent" : ""
              }`}
            >
              <div className="font-medium text-sm">{suggestion.modelId}</div>
              <div className="text-xs text-muted-foreground truncate">
                {suggestion.modelName}
              </div>
	              {suggestion.description && (
	                <div className="text-xs text-muted-foreground truncate mt-0.5">
	                  {suggestion.description}
	                </div>
	              )}
	              {(suggestion.contextLength !== null || suggestion.maxCompletionTokens !== null) && (
	                <div className="text-xs text-muted-foreground mt-0.5">
	                  {suggestion.contextLength !== null
	                    ? `context: ${suggestion.contextLength.toLocaleString()} tokens`
	                    : "context: unknown"}
	                  {suggestion.maxCompletionTokens !== null
	                    ? ` • max completion: ${suggestion.maxCompletionTokens.toLocaleString()} tokens`
	                    : ""}
	                </div>
	              )}
	            </button>
	          ))}
	        </div>
	      )}
      
      {/* Loading state for autocomplete */}
      {showSuggestions && isAutocompleteLoading && (
        <div className="popover absolute z-50 w-full mt-1 p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin icon-sm" />
            Searching…
          </div>
        </div>
      )}
    </div>
  );
}

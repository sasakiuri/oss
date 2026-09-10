-- SPDX-License-Identifier: MIT
-- Fail the build if Graphviz fails; never replace a failed diagram with empty content.
function CodeBlock(block)
  if block.classes:includes('dot') or block.classes:includes('graphviz') then
    local hash = pandoc.utils.sha1(block.text)
    local target = 'diagrams/' .. hash .. '.png'
    local png = pandoc.pipe('dot', {'-Tpng'}, block.text)
    local output = assert(io.open(target, 'wb'))
    output:write(png)
    output:close()
    return pandoc.Para({pandoc.Image('Graphviz diagram', target)})
  end
end

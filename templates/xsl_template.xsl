<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output method="xml" indent="yes" encoding="UTF-8"/>
	<xsl:template match="@* | node()">
		<xsl:copy>
			<xsl:apply-templates select="@* | node()"/>
		</xsl:copy>
	</xsl:template>
	
	<xsl:template match="customer">
		<customer>
			<xsl:apply-templates/>
			<decorator>
				<output_getquerydata>
					<queries>
						<query name="Custom/CMHS/networkName/queryName">
							<parameters>
								<parameter name="id"><xsl:value-of select=".//id"/></parameter>								
								
							</parameters>
						</query>
												
					</queries>
				</output_getquerydata>
			</decorator>
		</customer>
	</xsl:template>
	<xsl:template match="text()[not(normalize-space())]"/>
</xsl:stylesheet>